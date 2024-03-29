/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */
import os from "os";
import debugLogger from "debug";
import { spawn } from "child_process";
import KMDaemon from "pm2t-io-agent";
import rpc from "pm2-axon-rpc";
import forEach from "async/forEach";
import axon from "pm2-axon";
import fs from "fs";
import path from "path";
import mkdirp from "mkdirp";

import Common from "./Common";
import pkg from "../package.json";
import which from "./tools/which";
import cst from "./constants";
import Daemon from "./Daemon";
import vCheck from "./VersionCheck";
import { AnyObject } from "./TypeUtils";

const debug = debugLogger("pm2t:client");

function noop() {
    // do nothing
}

class Client{
    conf: AnyObject;

    sub_sock: AnyObject;

    daemon_mode: boolean;
    pm2_home: string;
    public_key: string;
    secret_key: string;
    machine_name: string;

    rpc_socket_file: string;
    pub_socket_file: string;

    client: rpc.Client;

    interactor_process;
    client_sock;
    sub;

    constructor(opts) {
        if (!opts) {
            opts = {};
        }

        if (!opts.conf) {
            this.conf = cst;
        } else {
            this.conf = opts.conf;
        }

        this.sub_sock = {};
        this.daemon_mode = typeof (opts.daemon_mode) === "undefined" ? true : opts.daemon_mode;
        this.pm2_home = this.conf.PM2_ROOT_PATH;
        this.secret_key = opts.secret_key;
        this.public_key = opts.public_key;
        this.machine_name = opts.machine_name;

        // Create all folders and files needed
        // Client depends to that to interact with PM2 properly
        this.initFileStructure(this.conf);

        debug("Using RPC file %s", this.conf.DAEMON_RPC_PORT);
        debug("Using PUB file %s", this.conf.DAEMON_PUB_PORT);
        this.rpc_socket_file = this.conf.DAEMON_RPC_PORT;
        this.pub_socket_file = this.conf.DAEMON_PUB_PORT;
    }

    // @breaking change (noDaemonMode has been drop)
    // @todo ret err
    start = (cb) => {
        this.pingDaemon((daemonAlive) => {
            if (daemonAlive === true) {
                return this.launchRPC((err, meta) => {
                    return cb(null, {
                        daemon_mode: this.conf.daemon_mode,
                        new_pm2_instance: false,
                        rpc_socket_file: this.rpc_socket_file,
                        pub_socket_file: this.pub_socket_file,
                        pm2_home: this.pm2_home
                    });
                });
            }

            /**
             * No Daemon mode
             */
            if (this.daemon_mode === false) {
                const daemon = new Daemon({
                    pub_socket_file: this.conf.DAEMON_PUB_PORT,
                    rpc_socket_file: this.conf.DAEMON_RPC_PORT,
                    pid_file: this.conf.PM2_PID_FILE_PATH,
                    ignore_signals: true
                });

                console.log("Launching in no daemon mode");

                daemon.innerStart(() => {
                    KMDaemon.launchAndInteract(this.conf, {
                        machine_name: this.machine_name,
                        public_key: this.public_key,
                        secret_key: this.secret_key,
                        pm2_version: pkg.version
                    }, (err, data, interactor_proc) => {
                        this.interactor_process = interactor_proc;
                    });

                    this.launchRPC((err, meta) => {
                        return cb(null, {
                            daemon_mode: this.conf.daemon_mode,
                            new_pm2_instance: true,
                            rpc_socket_file: this.rpc_socket_file,
                            pub_socket_file: this.pub_socket_file,
                            pm2_home: this.pm2_home
                        });
                    });
                });
                return false;
            }

            /**
             * Daemon mode
             */
            this.launchDaemon((err, child) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(err) : process.exit(this.conf.ERROR_EXIT);
                }

                if (!process.env.PM2_DISCRETE_MODE) {
                    Common.printOut(this.conf.PREFIX_MSG + "PM2 Successfully daemonized");
                }

                this.launchRPC((err, meta) => {
                    return cb(null, {
                        daemon_mode: this.conf.daemon_mode,
                        new_pm2_instance: true,
                        rpc_socket_file: this.rpc_socket_file,
                        pub_socket_file: this.pub_socket_file,
                        pm2_home: this.pm2_home
                    });
                });
            });
        });
    };

    // Init file structure of pm2_home
    // This includes
    // - pm2 pid and log path
    // - rpc and pub socket for command execution
    initFileStructure = (opts) => {
        if (!fs.existsSync(opts.DEFAULT_LOG_PATH)) {
            try {
                mkdirp.sync(opts.DEFAULT_LOG_PATH);
            } catch (e: any) {
                console.error(e.stack || e);
            }
        }

        if (!fs.existsSync(opts.DEFAULT_PID_PATH)) {
            try {
                mkdirp.sync(opts.DEFAULT_PID_PATH);
            } catch (e: any) {
                console.error(e.stack || e);
            }
        }

        if (!fs.existsSync(opts.PM2_MODULE_CONF_FILE)) {
            try {
                fs.writeFileSync(opts.PM2_MODULE_CONF_FILE, "{}");
            } catch (e: any) {
                console.error(e.stack || e);
            }
        }

        if (!fs.existsSync(opts.DEFAULT_MODULE_PATH)) {
            try {
                mkdirp.sync(opts.DEFAULT_MODULE_PATH);
            } catch (e: any) {
                console.error(e.stack || e);
            }
        }

        if (process.env.PM2_DISCRETE_MODE) {
            try {
                fs.writeFileSync(path.join(opts.PM2_HOME, "touch"), Date.now().toString());
            } catch (e: any) {
                debug(e.stack || e);
            }
        }

        if (!process.env.PM2_PROGRAMMATIC && !fs.existsSync(path.join(opts.PM2_HOME, "touch"))) {
            vCheck({
                state: "install",
                version: pkg.version
            });

            const dt = fs.readFileSync(path.resolve(__dirname, "..", opts.PM2_BANNER));
            console.log(dt.toString());
            try {
                fs.writeFileSync(path.join(opts.PM2_HOME, "touch"), Date.now().toString());
            } catch (e: any) {
                debug(e.stack || e);
            }
        }
    };

    close = (cb) => {
        forEach([
            this.disconnectRPC.bind(this),
            this.disconnectBus.bind(this)
        ], function (fn, next) {
            fn(next);
        }, cb);
    };

    /**
     * Launch the Daemon by forking this same file
     * The method Client.remoteWrapper will be called
     *
     * @method launchDaemon
     * @param {Object} opts
     * @param {Object} [opts.interactor=true] allow to disable interaction on launch
     */
    launchDaemon = (opts, cb?) => {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = {
                interactor: true
            };
        }

        const ClientJS = path.resolve(path.dirname(module.filename), "Daemon.js");
        let node_args = [];
        let out, err;

        // if (process.env.TRAVIS) {
        //   // Redirect PM2 internal err and out to STDERR STDOUT when running with Travis
        //   out = 1;
        //   err = 2;
        // }
        // else {
        out = fs.openSync(this.conf.PM2_LOG_FILE_PATH, "a"),
        err = fs.openSync(this.conf.PM2_LOG_FILE_PATH, "a");
        //}

        if (this.conf.LOW_MEMORY_ENVIRONMENT) {
            node_args.push("--gc-global"); // Does full GC (smaller memory footprint)
            node_args.push("--max-old-space-size=" + Math.floor(os.totalmem() / 1024 / 1024));
        }

        // Node.js tuning for better performance
        //node_args.push('--expose-gc'); // Allows manual GC in the code

        /**
         * Add node [arguments] depending on PM2_NODE_OPTIONS env variable
         */
        if (process.env.PM2_NODE_OPTIONS) {
            node_args = node_args.concat(process.env.PM2_NODE_OPTIONS.split(" "));
        }
        node_args.push(ClientJS);

        if (!process.env.PM2_DISCRETE_MODE) {
            Common.printOut(this.conf.PREFIX_MSG + "Spawning PM2 daemon with pm2_home=" + this.pm2_home);
        }

        let interpreter = "node";

        if (which("node") == null) {
            interpreter = process.execPath;
        }

        const spawnEnv = Object.assign({}, {
            "SILENT": this.conf.DEBUG ? !this.conf.DEBUG : true,
            "PM2_HOME": this.pm2_home
        }, process.env);

        const child = spawn(interpreter, node_args, {
            detached: true,
            cwd: this.conf.cwd || process.cwd(),
            env: spawnEnv,
            stdio: ["ipc", out, err]
        });

        function onError(e) {
            console.error(e.message || e);
            return cb ? cb(e.message || e) : false;
        }

        child.once("error", onError);

        child.unref();

        child.once("message", function (msg) {
            debug("PM2 daemon launched with return message: ", msg);
            child.removeListener("error", onError);
            child.disconnect();

            if (opts && opts.interactor == false) {
                return cb(null, child);
            }

            if (process.env.PM2_NO_INTERACTION == "true") {
                return cb(null, child);
            }

            /**
             * Here the Keymetrics agent is launched automaticcaly if
             * it has been already configured before (via pm2 link)
             */
            KMDaemon.launchAndInteract(this.conf, {
                machine_name: this.machine_name,
                public_key: this.public_key,
                secret_key: this.secret_key,
                pm2_version: pkg.version
            }, (err, data, interactor_proc) => {
                this.interactor_process = interactor_proc;
                return cb(null, child);
            });
        });
    };

    /**
     * Ping the daemon to know if it alive or not
     * @api public
     * @method pingDaemon
     * @param {} cb
     * @return
     */
    pingDaemon = (cb) => {
        const req = axon.socket("req", null);
        const client = new rpc.Client(req);

        debug("[PING PM2] Trying to connect to server");

        client.sock.once("reconnect attempt", () => {
            client.sock.close();
            debug("Daemon not launched");
            process.nextTick(function () {
                return cb(false);
            });
        });

        client.sock.once("error", (e) => {
            if (e.code === "EACCES") {
                fs.stat(this.conf.DAEMON_RPC_PORT, (e, stats) => {
                    if (stats.uid === 0) {
                        // console.error(this.conf.PREFIX_MSG_ERR + "Permission denied, to give access to current user:");
                        console.log(new Error(this.conf.PREFIX_MSG_ERR + "Permission denied, to give access to current user:").stack);
                        console.log("$ sudo chown " + process.env.USER + ":" + process.env.USER + " " + this.conf.DAEMON_RPC_PORT + " " + this.conf.DAEMON_PUB_PORT);
                    } else {
                        // console.error(this.conf.PREFIX_MSG_ERR + "Permission denied, check permissions on " + this.conf.DAEMON_RPC_PORT);
                        console.log(new Error(this.conf.PREFIX_MSG_ERR + "Permission denied, check permissions on " + this.conf.DAEMON_RPC_PORT).stack);
                    }

                    process.exit(1);
                });
            } else {
                console.error(e.message || e);
            }
        });

        client.sock.once("connect", function () {
            client.sock.once("close", function () {
                return cb(true);
            });
            client.sock.close();
            debug("Daemon alive");
        });

        req.connect(this.rpc_socket_file);
    };

    /**
     * Methods to interact with the Daemon via RPC
     * This method wait to be connected to the Daemon
     * Once he's connected it trigger the command parsing (on ./bin/pm2 file, at the end)
     * @method launchRPC
     * @params {function} [cb]
     * @return
     */
    launchRPC = (cb) => {
        debug("Launching RPC client on socket file %s", this.rpc_socket_file);
        const req = axon.socket("req", null);
        this.client = new rpc.Client(req);

        const connectHandler = () => {
            this.client.sock.removeListener("error", errorHandler);
            debug("RPC Connected to Daemon");
            if (cb) {
                setTimeout(function () {
                    cb(null);
                }, 4);
            }
        };

        const errorHandler = (e) => {
            this.client.sock.removeListener("connect", connectHandler);
            if (cb) {
                return cb(e);
            }
        };

        this.client.sock.once("connect", connectHandler);
        this.client.sock.once("error", errorHandler);
        this.client_sock = req.connect(this.rpc_socket_file);
    };

    /**
     * Methods to close the RPC connection
     * @callback cb
     */
    disconnectRPC = (cb) => {
        if (!cb) {
            cb = noop;
        }

        if (!this.client_sock || !this.client_sock.close) {
            this.client = null;
            return process.nextTick(function () {
                cb(new Error("SUB connection to PM2 is not launched"));
            });
        }

        if (this.client_sock.connected === false ||
            this.client_sock.closing === true) {
            this.client = null;
            return process.nextTick(function () {
                cb(new Error("RPC already being closed"));
            });
        }

        try {
            let timer; // eslint-disable-line prefer-const

            this.client_sock.once("close", () => {
                clearTimeout(timer);
                this.client = null;
                debug("PM2 RPC cleanly closed");
                return cb(null, { msg: "RPC Successfully closed" });
            });

            timer = setTimeout(() => {
                if (this.client_sock.destroy) {
                    this.client_sock.destroy();
                }
                this.client = null;
                return cb(null, { msg: "RPC Successfully closed via timeout" });
            }, 200);

            this.client_sock.close();
        } catch (e: any) {
            debug("Error while disconnecting RPC PM2", e.stack || e);
            return cb(e);
        }
        return false;
    };

    launchBus = (cb) => {
        this.sub = axon.socket("sub-emitter", null);
        this.sub_sock = this.sub.connect(this.pub_socket_file);

        this.sub_sock.once("connect", () => {
            return cb(null, this.sub, this.sub_sock);
        });
    };

    disconnectBus = (cb) => {
        if (!cb) {
            cb = noop;
        }

        if (!this.sub_sock || !this.sub_sock.close) {
            this.sub = null;
            return process.nextTick(function () {
                cb(null, { msg: "bus was not connected" });
            });
        }

        if (this.sub_sock.connected === false ||
            this.sub_sock.closing === true) {
            this.sub = null;
            return process.nextTick(function () {
                cb(new Error("SUB connection is already being closed"));
            });
        }

        try {
            let timer; // eslint-disable-line prefer-const

            this.sub_sock.once("close", () => {
                this.sub = null;
                clearTimeout(timer);
                debug("PM2 PUB cleanly closed");
                return cb();
            });

            timer = setTimeout(() => {
                if (this.sub_sock.destroy) {
                    this.sub_sock.destroy();
                }
                return cb();
            }, 200);

            this.sub_sock.close();
        } catch (e) {
            return cb(e);
        }
    };

    /**
     * Description
     * @method gestExposedMethods
     * @param {} cb
     * @return
     */
    getExposedMethods = (cb) => {
        this.client.methods(cb);
    };

    /**
     * Description
     * @method executeRemote
     * @param {} method
     * @param {} env
     * @param {} fn
     * @return
     */
    executeRemote = (method, app_conf, fn?) => {
        // stop watch on stop | env is the process id
        if (method.indexOf("stop") !== -1) {
            this.stopWatch(method, app_conf);
        } else if (method.indexOf("delete") !== -1) { // stop watching when process is deleted
            this.stopWatch(method, app_conf);
        } else if (method.indexOf("kill") !== -1) { // stop everything on kill
            this.stopWatch("deleteAll", app_conf);
        } else if (method.indexOf("restartProcessId") !== -1 && process.argv.indexOf("--watch") > -1) {
            delete app_conf.env.current_conf.watch;
            this.toggleWatch(method, app_conf);
        }

        if (!this.client || !this.client.call) {
            this.start((error) => {
                if (error) {
                    if (fn) {
                        return fn(error);
                    }
                    console.error(error);
                    return process.exit(0);
                }
                if (this.client) {
                    return this.client.call(method, app_conf, fn);
                }
            });
            return false;
        }

        debug("Calling daemon method pm2:%s on rpc socket:%s", method, this.rpc_socket_file);
        return this.client.call(method, app_conf, fn);
    };

    notifyGod = (action_name, id, cb?) => {
        this.executeRemote("notifyByProcessId", {
            id: id,
            action_name: action_name,
            manually: true
        }, function () {
            debug("God notified");
            return cb ? cb() : false;
        });
    };

    killDaemon = (fn) => {
        let timeout; // eslint-disable-line prefer-const
        const quit = () => {
            this.close(function () {
                return fn ? fn(null, { success: true }) : false;
            });
        };

        // under unix, we listen for signal (that is send by daemon to notify us that its shuting down)
        if (process.platform !== "win32") {
            process.once("SIGQUIT", function () {
                debug("Received SIGQUIT from pm2 daemon");
                clearTimeout(timeout);
                quit();
            });
        } else {
            // if under windows, try to ping the daemon to see if it still here
            setTimeout(() => {
                this.pingDaemon(function (alive) {
                    if (!alive) {
                        clearTimeout(timeout);
                        return quit();
                    }
                });
            }, 250);
        }

        timeout = setTimeout(function () {
            quit();
        }, 3000);

        // Kill daemon
        this.executeRemote("killMe", { pid: process.pid });
    };


    /**
     * Description
     * @method toggleWatch
     * @param {String} pm2 method name
     * @param {Object} application environment, should include id
     * @param {Function} callback
     */
    toggleWatch = (method, env, fn?) => {
        debug("Calling toggleWatch");
        this.client.call("toggleWatch", method, env, function () {
            return fn ? fn() : false;
        });
    };

    /**
     * Description
     * @method startWatch
     * @param {String} pm2 method name
     * @param {Object} application environment, should include id
     * @param {Function} callback
     */
    startWatch = (method, env, fn) => {
        debug("Calling startWatch");
        this.client.call("startWatch", method, env, function () {
            return fn ? fn() : false;
        });
    };

    /**
     * Description
     * @method stopWatch
     * @param {String} pm2 method name
     * @param {Object} application environment, should include id
     * @param {Function} callback
     */
    stopWatch = (method, env, fn?) => {
        debug("Calling stopWatch");
        this.client.call("stopWatch", method, env, function () {
            return fn ? fn() : false;
        });
    };

    getAllProcess = (cb) => {
        // const found_proc = [];

        this.executeRemote("getMonitorData", {}, function (err, procs) {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            return cb(null, procs);
        });
    };

    getAllProcessId = (cb) => {
        // const found_proc = [];

        this.executeRemote("getMonitorData", {}, function (err, procs) {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            return cb(null, procs.map(proc => proc.pm_id));
        });
    };

    getAllProcessIdWithoutModules = (cb) => {
        // const found_proc = [];

        this.executeRemote("getMonitorData", {}, (err, procs) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            const proc_ids = procs
                .filter(proc => !proc.pm2_env.pmx_module)
                .map(proc => proc.pm_id);

            return cb(null, proc_ids);
        });
    };

    getProcessIdByName = (name, force_all, cb?) => {
        const found_proc = [];
        const full_details = {};

        if (typeof (cb) === "undefined") {
            cb = force_all;
            force_all = false;
        }

        if (typeof (name) == "number") {
            name = name.toString();
        }

        this.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            list.forEach(function (proc) {
                if (proc.pm2_env.name == name || proc.pm2_env.pm_exec_path == path.resolve(name)) {
                    found_proc.push(proc.pm_id);
                    full_details[proc.pm_id] = proc;
                }
            });

            return cb(null, found_proc, full_details);
        });
    };

    getProcessIdsByNamespace = (namespace, force_all, cb?) => {
        const found_proc = [];
        const full_details = {};

        if (typeof (cb) === "undefined") {
            cb = force_all;
            force_all = false;
        }

        if (typeof (namespace) == "number") {
            namespace = namespace.toString();
        }

        this.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            list.forEach(function (proc) {
                if (proc.pm2_env.namespace == namespace) {
                    found_proc.push(proc.pm_id);
                    full_details[proc.pm_id] = proc;
                }
            });

            return cb(null, found_proc, full_details);
        });
    };

    getProcessByName = (name, cb) => {
        const found_proc = [];

        this.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            list.forEach((proc) => {
                if (proc.pm2_env.name == name ||
                    proc.pm2_env.pm_exec_path == path.resolve(name)) {
                    found_proc.push(proc);
                }
            });

            return cb(null, found_proc);
        });
    };

    getProcessByNameOrId = (nameOrId, cb) => {
        const foundProc = [];

        this.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(err);
            }

            list.forEach((proc) => {
                if (proc.pm2_env.name === nameOrId ||
                    proc.pm2_env.pm_exec_path === path.resolve(nameOrId) ||
                    proc.pid === parseInt(nameOrId) ||
                    proc.pm2_env.pm_id === parseInt(nameOrId)) {
                    foundProc.push(proc);
                }
            });

            return cb(null, foundProc);
        });
    };
}

export default Client;

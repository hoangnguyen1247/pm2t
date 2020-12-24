/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

import commander from "commander";
import fs from "fs";
import path from "path";
import eachLimit from "async/eachLimit";
import series from "async/series";
import debugLogger from "debug";
import util from "util";
import chalk from "chalk";
import fclone from "fclone";
import crypto from "crypto";
import semver from "semver";
import dayjs from "dayjs";
import KMDaemon from "pm2t-io-agent";

import DockerMgmt from "./ExtraMgmt/Docker";
import cst from "../constants";
import Client from "../Client";
import Common from "../Common";
import Config from "../tools/Config";
import Modularizer from "./Modules/Modularizer";
import path_structure from "../../paths";
import UX from "./UX";
import pkg from "../../package.json";
import hf from "./Modules/flagExt";
import Configuration from "../Configuration";
import sexec from "../tools/sexec";
import json5 from "../tools/json5";
// import treeify from './tools/treeify'

//////////////////////////
// Load all API methods //
//////////////////////////

import * as fmt from "../tools/fmt";
import copyDirSync from "../tools/copydirSync";
import Log from "./Log";
import Dashboard from "./Dashboard";
import Monit from "./Monit";

import Utility from "../Utility";
import pm2Deploy from "pm2t-deploy";

import { AnyObject } from "../TypeUtils";

import eachSeries from "async/eachSeries";
import child from "child_process";

import forEachLimit from "async/forEachLimit";
import { tmpdir as tmpPath } from "os";
import which from "../tools/which";

import { spawn } from "child_process";
import Promise from "../tools/promise.min";

import forEach from "async/forEach";

import open from "../tools/open";

const printError = Common.printError;
const printOut = Common.printOut;
let EXEC_TIMEOUT = 60000; // Default: 1 min

const debug = debugLogger("pm2:cli");
const IMMUTABLE_MSG = chalk.bold.blue("Use --update-env to update environment variables");

let conf = cst;

/**
 * From Extra - Start
 */
function basicMDHighlight(lines) {
    console.log("\n\n+-------------------------------------+");
    console.log(chalk.bold("README.md content:"));
    lines = lines.split("\n");
    let isInner = false;
    lines.forEach(l => {
        if (l.startsWith("#")) {
            console.log(chalk.bold.green(l));
        } else if (isInner || l.startsWith("```")) {
            if (isInner && l.startsWith("```")) {
                isInner = false;
            } else if (isInner == false) {
                isInner = true;
            }
            console.log(chalk.grey(l));
        } else if (l.startsWith("`")) {
            console.log(chalk.grey(l));
        } else {
            console.log(l);
        }
    });
    console.log("+-------------------------------------+");
}

/**
 * From Extra - End
 */

/**
 * From Deploy - Start
 */

/**
 * From Version - Start
 */

/**
 * From Version - End
 */

function deployHelper() {
    console.log("");
    console.log("-----> Helper: Deployment with PM2");
    console.log("");
    console.log("  Generate a sample ecosystem.config.js with the command");
    console.log("  $ pm2 ecosystem");
    console.log("  Then edit the file depending on your needs");
    console.log("");
    console.log("  Commands:");
    console.log("    setup                run remote setup commands");
    console.log("    update               update deploy to the latest release");
    console.log("    revert [n]           revert to [n]th last deployment or 1");
    console.log("    curr[ent]            output current release commit");
    console.log("    prev[ious]           output previous release commit");
    console.log("    exec|run <cmd>       execute the given <cmd>");
    console.log("    list                 list previous deploy commits");
    console.log("    [ref]                deploy to [ref], the \"ref\" setting, or latest tag");
    console.log("");
    console.log("");
    console.log("  Basic Examples:");
    console.log("");
    console.log("    First initialize remote production host:");
    console.log("    $ pm2 deploy ecosystem.config.js production setup");
    console.log("");
    console.log("    Then deploy new code:");
    console.log("    $ pm2 deploy ecosystem.config.js production");
    console.log("");
    console.log("    If I want to revert to the previous commit:");
    console.log("    $ pm2 deploy ecosystem.config.js production revert 1");
    console.log("");
    console.log("    Execute a command on remote server:");
    console.log("    $ pm2 deploy ecosystem.config.js production exec \"pm2 restart all\"");
    console.log("");
    console.log("    PM2 will look by default to the ecosystem.config.js file so you dont need to give the file name:");
    console.log("    $ pm2 deploy production");
    console.log("    Else you have to tell PM2 the name of your ecosystem file");
    console.log("");
    console.log("    More examples in https://github.com/Unitech/pm2");
    console.log("");
}
 
/**
 * From Deploy - End
 */


/**
 * From Module - Start
 */



/**
 * From Module - End
 */

/**
 * From Configuration - Start
 */

function interactiveConfigEdit(cb) {
    UX.helpers.openEditor(cst.PM2_MODULE_CONF_FILE, {}, (err, data) => {
        Common.printOut(chalk.bold("Module configuration (%s) edited."), cst.PM2_MODULE_CONF_FILE);
        Common.printOut(chalk.bold("To take changes into account, please restart module related."), cst.PM2_MODULE_CONF_FILE);
        if (err) {
            return cb(Common.retErr(err));
        }
        return cb(null, { success: true });
    });

}

/**
 * Configuration
 */
function displayConf(target_app, cb?) {
    if (typeof (target_app) == "function") {
        cb = target_app;
        target_app = null;
    }

    Configuration.getAll(function (err, data) {
        UX.helpers.dispKeys(data, target_app);
        return cb();
    });
}

/**
 * From Configuration - End
 */


/**
 * From Version - Start
 */ 

const exec = function (cmd, callback) {
    let output = "";

    const c = child.exec(cmd, {
        env: process.env,
        maxBuffer: 3 * 1024 * 1024,
        timeout: EXEC_TIMEOUT
    }, function (err) {
        if (callback) {
            callback(err ? err.code : 0, output);
        }
    });

    c.stdout.on("data", function (data) {
        output += data;
    });

    c.stderr.on("data", function (data) {
        output += data;
    });
};

/**
 *
 * @method execCommands
 * @param {string} repo_path
 * @param {object} command_list
 * @return
 */
const execCommands = function (repo_path, command_list, cb) {
    let stdout = "";

    eachSeries(command_list, (command, callback) => {
        stdout += "\n" + command;
        exec("cd " + repo_path + ";" + command,
            (code, output) => {
                stdout += "\n" + output;
                if (code === 0) {
                    callback();
                } else {
                    callback("`" + command + "` failed");
                }
            });
    }, (err) => {
        if (err) {
            return cb(stdout + "\n" + err);
        }
        return cb(null, stdout);
    });
};

/**
 * Description Search process.json for post-update commands
 * @method getPostUpdateCmds
 * @param {string} repo_path
 * @param {string} proc_name
 * @return
 */
const getPostUpdateCmds = function (repo_path, proc_name, cb) {
    if (typeof repo_path !== "string") {
        return cb([]);
    }
    if (repo_path[repo_path.length - 1] !== "/") {
        repo_path += "/";
    }

    const searchForCommands = function (file, callback) {
        fs.exists(repo_path + file, function (exists) {
            if (exists) {
                let data = null;
                try {
                    const conf_string = fs.readFileSync(repo_path + file);
                    data = Common.parseConfig(conf_string, repo_path + file);
                } catch (e) {
                    console.error(e.message || e);
                }

                if (data && data.apps) {
                    eachSeries(data.apps, function (item, callb) {
                        if (item.name && item.name === proc_name) {
                            if (item.post_update && typeof (item.post_update) === "object") {
                                if (item.exec_timeout) {
                                    EXEC_TIMEOUT = parseInt(item.exec_timeout);
                                }
                                return callb(item.post_update);
                            } else {
                                return callb();
                            }
                        } else {
                            return callb();
                        }
                    }, function (final) {
                        return callback(final);
                    });
                } else {
                    return callback();
                }
            } else {
                return callback();
            }
        });
    };

    eachSeries(["ecosystem.json", "process.json", "package.json"], searchForCommands,
        function (final) {
            return cb(final ? final : []);
        });
};

/**
 * From Version - Start
 */ 

/**
 * From Startup - Start
 */

/**
   * If command is launched without root right
   * Display helper
   */
function isNotRoot(startup_mode, platform, opts, cb) {
    Common.printOut(`${cst.PREFIX_MSG}To ${startup_mode} the Startup Script, copy/paste the following command:`);
    if (opts.user) {
        console.log("sudo env PATH=$PATH:" + path.dirname(process.execPath) + " pm2 " + opts.args[1].name() + " " + platform + " -u " + opts.user + " --hp " + process.env.HOME);
        return cb(new Error("You have to run this with elevated rights"));
    }
    return sexec("whoami", { silent: true }, function (err, stdout, stderr) {
        console.log("sudo env PATH=$PATH:" + path.dirname(process.execPath) + " " + require.main.filename + " " + opts.args[1].name() + " " + platform + " -u " + stdout.trim() + " --hp " + process.env.HOME);
        return cb(new Error("You have to run this with elevated rights"));
    });
}

/**
   * Detect running init system
   */
function detectInitSystem() {
    const hash_map = {
        "systemctl": "systemd",
        "update-rc.d": "upstart",
        "chkconfig": "systemv",
        "rc-update": "openrc",
        "launchctl": "launchd",
        "sysrc": "rcd",
        "rcctl": "rcd-openbsd",
        "svcadm": "smf"
    };
    const init_systems = Object.keys(hash_map);

    let i;
    for (i = 0; i < init_systems.length; i++) {
        if (which(init_systems[i]) != null) {
            break;
        }
    }

    if (i >= init_systems.length) {
        Common.printError(cst.PREFIX_MSG_ERR + "Init system not found");
        return null;
    }
    Common.printOut(cst.PREFIX_MSG + "Init System found: " + chalk.bold(hash_map[init_systems[i]]));
    return hash_map[init_systems[i]];
}
  
/**
 * From Startup - End
 */

/**
 * From Containerizer - Start
 */

function pspawn(cmd) {
    return new Promise(function (resolve, reject) {
        const p_cmd = cmd.split(" ");

        const install_instance = spawn(p_cmd[0], p_cmd.splice(1, cmd.length), {
            stdio: "inherit",
            env: process.env,
            shell: true
        });

        install_instance.on("close", function (code) {
            if (code != 0) {
                console.log(chalk.bold.red("Command failed"));
                return reject(new Error("Bad cmd return"));
            }
            return resolve();
        });

        install_instance.on("error", function (err) {
            return reject(err);
        });
    });
}

function checkDockerSetup() {
    return new Promise(function (resolve, reject) {
        exec("docker version -f '{{.Client.Version}}'", function (err, stdout, stderr) {
            if (err) {
                console.error(chalk.red.bold("[Docker access] Error while trying to use docker command"));
                if (err.message && err.message.indexOf("Cannot connect to the Docker") > -1) {
                    console.log();
                    console.log(chalk.blue.bold("[Solution] Setup Docker to be able to be used without sudo rights:"));
                    console.log(chalk.bold("$ sudo groupadd docker"));
                    console.log(chalk.bold("$ sudo usermod -aG docker $USER"));
                    console.log(chalk.bold("Then LOGOUT and LOGIN your Linux session"));
                    console.log("Read more: http://bit.ly/29JGdCE");
                }
                return reject(err);
            }
            return resolve();
        });
    });
}

/**
 * Switch Dockerfile mode
 * check test/programmatic/containerizer.mocha.js
 */
function parseAndSwitch(file_content, main_file, opts) {
    let lines = file_content.split("\n");
    const mode = opts.mode;

    lines[0] = "FROM keymetrics/pm2:" + opts.node_version;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (["## DISTRIBUTION MODE", "## DEVELOPMENT MODE"].indexOf(line) > -1 ||
            i == lines.length - 1) {
            lines.splice(i, lines.length);
            lines[i] = "## " + mode.toUpperCase() + " MODE";
            lines[i + 1] = "ENV NODE_ENV=" + (mode == "distribution" ? "production" : mode);

            if (mode == "distribution") {
                lines[i + 2] = "COPY . /var/app";
                lines[i + 3] = "CMD [\"pm2-docker\", \"" + main_file + "\", \"--env\", \"production\"]";
            }
            if (mode == "development") {
                lines[i + 2] = "CMD [\"pm2-dev\", \"" + main_file + "\", \"--env\", \"development\"]";
            }
            break;
        }
    }
    lines = lines.join("\n");
    return lines;
}

/**
 * Replace ENV, COPY and CMD depending on the mode
 * @param {String} docker_filepath Dockerfile absolute path
 * @param {String} main_file       Main file to start in container
 * @param {String} mode            Mode to switch the Dockerfile
 */
function switchDockerFile(docker_filepath, main_file, opts) {
    return new Promise(function (resolve, reject) {
        const data = fs.readFileSync(docker_filepath, "utf8").toString();

        if (["distribution", "development"].indexOf(opts.mode) == -1) {
            return reject(new Error("Unknown mode"));
        }

        const lines = parseAndSwitch(data, main_file, opts);
        fs.writeFile(docker_filepath, lines, function (err) {
            if (err) {
                return reject(err);
            }
            resolve({
                Dockerfile_path: docker_filepath,
                Dockerfile: lines,
                CMD: ""
            });
        });
    });
}

/**
 * Generate sample Dockerfile (lib/templates/Dockerfiles)
 * @param {String} docker_filepath Dockerfile absolute path
 * @param {String} main_file       Main file to start in container
 * @param {String} mode            Mode to switch the Dockerfile
 */
function generateDockerfile(docker_filepath, main_file, opts) {
    return new Promise(function (resolve, reject) {
        const tpl_file = path.join(cst.TEMPLATE_FOLDER, cst.DOCKERFILE_NODEJS);
        let template = fs.readFileSync(tpl_file, { encoding: "utf8" });
        let CMD;

        template = parseAndSwitch(template, main_file, opts);

        fs.writeFile(docker_filepath, template, function (err) {
            if (err) {
                return reject(err);
            }
            resolve({
                Dockerfile_path: docker_filepath,
                Dockerfile: template,
                CMD: CMD
            });
        });
    });
}

function handleExit(CLI, opts, mode) {
    process.on("SIGINT", function () {
        CLI.disconnect();

        if (mode != "distribution") {
            return false;
        }

        exec("docker ps -lq", function (err, stdout, stderr) {
            if (err) {
                console.error(err);
            }
            require("vizion").analyze({ folder: process.cwd() }, function recur_path(err, meta) {
                if (!err && meta.revision) {
                    const commit_id = util.format("#%s(%s) %s",
                        meta.branch,
                        meta.revision.slice(0, 5),
                        meta.comment);

                    console.log(chalk.bold.magenta("$ docker commit -m \"%s\" %s %s"),
                        commit_id,
                        stdout.replace("\n", ""),
                        opts.imageName);
                } else {
                    console.log(chalk.bold.magenta("$ docker commit %s %s"), stdout.replace("\n", ""), opts.imageName);
                }

                console.log(chalk.bold.magenta("$ docker push %s"), opts.imageName);
            });
        });
    });
} 

/**
 * From Containerizer - End
 */


/**
 * Main Function to be imported
 * can be aliased to PM2
 *
 * To use it when PM2 is installed as a module:
 *
 * var PM2 = require('pm2');
 *
 * var pm2 = PM2(<opts>);
 *
 *
 * @param {Object}  opts
 * @param {String}  [opts.cwd=<current>]         override pm2 cwd for starting scripts
 * @param {String}  [opts.pm2_home=[<paths.js>]] pm2 directory for log, pids, socket files
 * @param {Boolean} [opts.independent=false]     unique PM2 instance (random pm2_home)
 * @param {Boolean} [opts.daemon_mode=true]      should be called in the same process or not
 * @param {String}  [opts.public_key=null]       pm2 plus bucket public key
 * @param {String}  [opts.secret_key=null]       pm2 plus bucket secret key
 * @param {String}  [opts.machine_name=null]     pm2 plus instance name
 */
class API {
    daemon_mode: boolean;
    pm2_home: string;
    public_key: string;
    secret_key: string;
    machine_name: string;

    cwd: string;

    _conf: AnyObject;

    Client: Client;

    pm2_configuration: AnyObject;

    gl_interact_infos: AnyObject;
    gl_is_km_linked: boolean;

    gl_retry: number;

    connected: boolean;

    constructor(opts?) {
        if (!opts) {
            opts = {};
        }

        this.daemon_mode = typeof (opts.daemon_mode) == "undefined" ? true : opts.daemon_mode;
        this.pm2_home = conf.PM2_ROOT_PATH;
        this.public_key = conf.PUBLIC_KEY || opts.public_key || null;
        this.secret_key = conf.SECRET_KEY || opts.secret_key || null;
        this.machine_name = conf.MACHINE_NAME || opts.machine_name || null;

        /**
         * CWD resolution
         */
        this.cwd = process.cwd();
        if (opts.cwd) {
            this.cwd = path.resolve(opts.cwd);
        }

        /**
         * PM2 HOME resolution
         */
        if (opts.pm2_home && opts.independent == true) {
            throw new Error("You cannot set a pm2_home and independent instance in same time");
        }

        if (opts.pm2_home) {
            // Override default conf file
            this.pm2_home = opts.pm2_home;
            conf = Object.assign({}, conf, path_structure(this.pm2_home));
        } else if (opts.independent == true && conf.IS_WINDOWS === false) {
            // Create an unique pm2 instance
            const random_file = crypto.randomBytes(8).toString("hex");
            this.pm2_home = path.join("/tmp", random_file);

            // If we dont explicitly tell to have a daemon
            // It will go as in proc
            if (typeof (opts.daemon_mode) == "undefined") {
                this.daemon_mode = false;
            }
            conf = Object.assign({}, conf, path_structure(this.pm2_home));
        }

        this._conf = conf;

        if (conf.IS_WINDOWS) {
            // Weird fix, may need to be dropped
            // @todo windows connoisseur double check
            // TODO: please check this
            // if (process.stdout._handle && process.stdout._handle.setBlocking)
            //   process.stdout._handle.setBlocking(true);
        }

        this.Client = new Client({
            pm2_home: this.pm2_home,
            conf: this._conf,
            secret_key: this.secret_key,
            public_key: this.public_key,
            daemon_mode: this.daemon_mode,
            machine_name: this.machine_name
        });

        this.pm2_configuration = Configuration.getSync("pm2") || {};

        this.gl_interact_infos = null;
        this.gl_is_km_linked = false;

        try {
            let pid: any = fs.readFileSync(conf.INTERACTOR_PID_PATH);
            pid = parseInt(pid.toString().trim());
            process.kill(pid, 0);
            this.gl_is_km_linked = true;
        } catch (e) {
            this.gl_is_km_linked = false;
        }

        // For testing purposes
        if (this.secret_key && process.env.NODE_ENV == "local_test") {
            this.gl_is_km_linked = true;
        }

        KMDaemon.ping(this._conf, (err, result) => {
            if (!err && result === true) {
                fs.readFile(conf.INTERACTION_CONF, (err, _conf) => {
                    if (!err) {
                        try {
                            this.gl_interact_infos = JSON.parse(_conf.toString());
                        } catch (e) {
                            try {
                                this.gl_interact_infos = json5.parse(_conf.toString());
                            } catch (e) {
                                console.error(e);
                                this.gl_interact_infos = null;
                            }
                        }
                    }
                });
            }
        });

        this.gl_retry = 0;
    }

    /**
     * Connect to PM2
     * Calling this command is now optional
     *
     * @param {Function} cb callback once pm2 is ready for commands
     */
    connect = function (noDaemon, cb?) {
        this.start_timer = new Date();

        if (typeof (cb) == "undefined") {
            cb = noDaemon;
            noDaemon = false;
        } else if (noDaemon === true) {
            // Backward compatibility with PM2 1.x
            this.Client.daemon_mode = false;
            this.daemon_mode = false;
        }

        this.Client.start((err, meta) => {
            if (err) {
                return cb(err);
            }

            if (meta.new_pm2_instance == false && this.daemon_mode === true) {
                return cb(err, meta);
            }

            // If new pm2 instance has been popped
            // Lauch all modules
            this.launchAll(this, function (err_mod) {
                return cb(err, meta);
            });
        });
    };

    /**
     * Usefull when custom PM2 created with independent flag set to true
     * This will cleanup the newly created instance
     * by removing folder, killing PM2 and so on
     *
     * @param {Function} cb callback once cleanup is successfull
     */
    destroy = function (cb) {
        debug("Killing and deleting current deamon");

        this.killDaemon(function () {
            const cmd = "rm -rf " + this.pm2_home;
            const test_path = path.join(this.pm2_home, "module_conf.json");
            // const test_path_2 = path.join(this.pm2_home, "pm2.pid");

            if (this.pm2_home.indexOf(".pm2") > -1) {
                return cb(new Error("Destroy is not a allowed method on .pm2"));
            }

            fs.access(test_path, fs.constants.R_OK, function (err) {
                if (err) {
                    return cb(err);
                }
                debug("Deleting temporary folder %s", this.pm2_home);
                sexec(cmd, cb);
            });
        });
    };

    /**
     * Disconnect from PM2 instance
     * This will allow your software to exit by itself
     *
     * @param {Function} [cb] optional callback once connection closed
     */
    disconnect = function (cb?) {
        if (!cb) {
            cb = function () { 
                // do nothing
            };
        }

        this.Client.close(function (err, data) {
            // debug('The session lasted %ds', (new Date() - that.start_timer) / 1000);
            return cb(err, data);
        });
    };

    /**
     * Alias on disconnect
     * @param cb
     */
    close = function (cb) {
        this.disconnect(cb);
    };

    /**
     * Launch modules
     *
     * @param {Function} cb callback once pm2 has launched modules
     */
    launchModules = function (cb) {
        this.launchAll(this, cb);
    };

    /**
     * Enable bus allowing to retrieve various process event
     * like logs, restarts, reloads
     *
     * @param {Function} cb callback called with 1st param err and 2nb param the bus
     */
    launchBus = function (cb) {
        this.Client.launchBus(cb);
    };

    /**
     * Exit methods for API
     * @param {Integer} code exit code for terminal
     */
    exitCli = (code) => {
        // Do nothing if PM2 called programmatically (also in speedlist)
        if (conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE != "CLI") {
            return false;
        }

        KMDaemon.disconnectRPC(() => {
            this.Client.close(() => {
                code = code || 0;
                // Safe exits process after all streams are drained.
                // file descriptor flag.
                let fds = 0;
                // exits process when stdout (1) and sdterr(2) are both drained.
                function tryToExit() {
                    if ((fds & 1) && (fds & 2)) {
                        // debug('This command took %ds to execute', (new Date() - that.start_timer) / 1000);
                        process.exit(code);
                    }
                }

                [process.stdout, process.stderr].forEach((std) => {
                    const fd = std.fd;
                    if (!std.bufferSize) {
                        // bufferSize equals 0 means current stream is drained.
                        fds = fds | fd;
                    } else {
                        // Appends nothing to the std queue, but will trigger `tryToExit` event on `drain`.
                        std.write && std.write("", () => {
                            fds = fds | fd;
                            tryToExit();
                        });
                    }
                    // Does not write anything more.
                    delete std.write;
                });
                tryToExit();
            });
        });
    };

    ////////////////////////////
    // Application management //
    ////////////////////////////

    /**
     * Start a file or json with configuration
     * @param {Object||String} cmd script to start or json
     * @param {Function} cb called when application has been started
     */
    start = function (cmd, opts, cb) {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = {};
        }
        if (!opts) {
            opts = {};
        }

        if (semver.lt(process.version, "6.0.0")) {
            Common.printOut(conf.PREFIX_MSG_WARNING + "Node 4 is deprecated, please upgrade to use pm2 to have all features");
        }

        if (util.isArray(opts.watch) && opts.watch.length === 0) {
            opts.watch = (opts.rawArgs ? !!~opts.rawArgs.indexOf("--watch") : !!~process.argv.indexOf("--watch")) || false;
        }

        if (Common.isConfigFile(cmd) || (typeof (cmd) === "object")) {
            this._startJson(cmd, opts, "restartProcessId", (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        } else {
            this._startScript(cmd, opts, (err, procs) => {
                return cb ? cb(err, procs) : this.speedList(0);
            });
        }
    };

    /**
     * Reset process counters
     *
     * @method resetMetaProcess
     */
    reset = function (process_name, cb?) {
        const processIds = (ids, cb) => {
            eachLimit(ids, conf.CONCURRENT_ACTIONS, (id, next) => {
                this.Client.executeRemote("resetMetaProcessId", id, (err, res) => {
                    if (err) {
                        console.error(err);
                    }
                    Common.printOut(conf.PREFIX_MSG + "Resetting meta for process id %d", id);
                    return next();
                });
            }, (err) => {
                if (err) {
                    return cb(Common.retErr(err));
                }
                return cb ? cb(null, { success: true }) : this.speedList();
            });
        };

        if (process_name == "all") {
            this.Client.getAllProcessId((err, ids) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                return processIds(ids, cb);
            });
        } else if (isNaN(process_name)) {
            this.Client.getProcessIdByName(process_name, (err, ids) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                if (ids.length === 0) {
                    Common.printError("Unknown process name");
                    return cb ? cb(new Error("Unknown process name")) : this.exitCli(conf.ERROR_EXIT);
                }
                return processIds(ids, cb);
            });
        } else {
            processIds([process_name], cb);
        }
    };

    /**
     * Update daemonized PM2 Daemon
     *
     * @param {Function} cb callback when pm2 has been upgraded
     */
    update = function(cb?){
        Common.printOut("Be sure to have the latest version by doing `npm install pm2t@latest -g` before doing this procedure.");

        // Dump PM2 processes
        this.Client.executeRemote("notifyKillPM2", {}, function () { 
            // do nothing
        });

        this.getVersion((err, new_version) => {
            // If not linked to PM2 plus, and update PM2 to latest, display motd.update
            if (!this.gl_is_km_linked && !err && (pkg.version != new_version)) {
                const dt = fs.readFileSync(path.join(__dirname, this._conf.PM2_UPDATE));
                console.log(dt.toString());
            }

            this.dump((err) => {
                debug("Dumping successfull", err);
                this.killDaemon(() => {
                    // debug('------------------ Everything killed', arguments as any);
                    this.Client.launchDaemon({ interactor: false }, (err, child) => {
                        this.Client.launchRPC(() => {
                            this.resurrect(() => {
                                Common.printOut(chalk.blue.bold(">>>>>>>>>> PM2 updated"));
                                this.launchAll(this, () => {
                                    KMDaemon.launchAndInteract(this._conf, {
                                        pm2_version: pkg.version
                                    }, (err, data, interactor_proc) => {
                                    });
                                    setTimeout(() => {
                                        return cb ? cb(null, { success: true }) : this.speedList();
                                    }, 250);
                                });
                            });
                        });
                    });
                });
            });
        });

        return false;
    };

    /**
     * Reload an application
     *
     * @param {String} process_name Application Name or All
     * @param {Object} opts         Options
     * @param {Function} cb         Callback
     */
    reload = function (process_name, opts, cb?) {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = {};
        }

        const delay = Common.lockReload();
        if (delay > 0 && opts.force != true) {
            Common.printError(conf.PREFIX_MSG_ERR + "Reload already in progress, please try again in " + Math.floor((conf.RELOAD_LOCK_TIMEOUT - delay) / 1000) + " seconds or use --force");
            return cb ? cb(new Error("Reload in progress")) : this.exitCli(conf.ERROR_EXIT);
        }

        if (Common.isConfigFile(process_name)) {
            this._startJson(process_name, opts, "reloadProcessId", (err, apps) => {
                Common.unlockReload();
                if (err) {
                    return cb ? cb(err) : this.exitCli(conf.ERROR_EXIT);
                }
                return cb ? cb(null, apps) : this.exitCli(conf.SUCCESS_EXIT);
            });
        } else {
            if (opts && opts.env) {
                const err = "Using --env [env] without passing the ecosystem.config.js does not work";
                Common.err(err);
                Common.unlockReload();
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }

            if (opts && !opts.updateEnv) {
                Common.printOut(IMMUTABLE_MSG);
            }

            this._operate("reloadProcessId", process_name, opts, function (err, apps) {
                Common.unlockReload();

                if (err) {
                    return cb ? cb(err) : this.exitCli(conf.ERROR_EXIT);
                }
                return cb ? cb(null, apps) : this.exitCli(conf.SUCCESS_EXIT);
            });
        }
    };

    /**
     * Restart process
     *
     * @param {String} cmd   Application Name / Process id / JSON application file / 'all'
     * @param {Object} opts  Extra options to be updated
     * @param {Function} cb  Callback
     */
    restart = function (cmd, opts, cb) {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = {};
        }

        if (typeof (cmd) === "number") {
            cmd = cmd.toString();
        }

        if (cmd == "-") {
            // Restart from PIPED JSON
            process.stdin.resume();
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (param) => {
                process.stdin.pause();
                this.actionFromJson("restartProcessId", param, opts, "pipe", cb);
            });
        } else if (Common.isConfigFile(cmd) || typeof (cmd) === "object") {
            this._startJson(cmd, opts, "restartProcessId", cb);
        } else {
            if (opts && opts.env) {
                const err = "Using --env [env] without passing the ecosystem.config.js does not work";
                Common.err(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }
            if (opts && !opts.updateEnv) {
                Common.printOut(IMMUTABLE_MSG);
            }
            this._operate("restartProcessId", cmd, opts, cb);
        }
    };

    /**
     * Delete process
     *
     * @param {String} process_name Application Name / Process id / Application file / 'all'
     * @param {Function} cb Callback
     */
    delete = function (process_name, jsonVia, cb?) {
        if (typeof (jsonVia) === "function") {
            cb = jsonVia;
            jsonVia = null;
        }

        if (typeof (process_name) === "number") {
            process_name = process_name.toString();
        }

        if (jsonVia == "pipe") {
            return this.actionFromJson("deleteProcessId", process_name, commander, "pipe", (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        }
        if (Common.isConfigFile(process_name)) {
            return this.actionFromJson("deleteProcessId", process_name, commander, "file", (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        } else {
            this._operate("deleteProcessId", process_name, (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        }
    };

    /**
     * Stop process
     *
     * @param {String} process_name Application Name / Process id / Application file / 'all'
     * @param {Function} cb Callback
     */
    stop = function (process_name, cb) {
        if (typeof (process_name) === "number") {
            process_name = process_name.toString();
        }

        if (process_name == "-") {
            process.stdin.resume();
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (param) => {
                process.stdin.pause();
                this.actionFromJson("stopProcessId", param, commander, "pipe", (err, procs) => {
                    return cb ? cb(err, procs) : this.speedList();
                });
            });
        } else if (Common.isConfigFile(process_name)) {
            this.actionFromJson("stopProcessId", process_name, commander, "file", (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        } else {
            this._operate("stopProcessId", process_name, (err, procs) => {
                return cb ? cb(err, procs) : this.speedList();
            });
        }
    };

    /**
     * Get list of all processes managed
     *
     * @param {Function} cb Callback
     */
    list = (opts?, cb?) => {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = null;
        }

        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }

            if (opts && opts.rawArgs && opts.rawArgs.indexOf("--watch") > -1) {
                const show = () => {
                    console.log("Show");
                    process.stdout.write("\x1b[2J");
                    process.stdout.write("\x1b[0f");
                    console.log("Last refresh: ", dayjs().format());
                    this.Client.executeRemote("getMonitorData", {}, (err, list) => {
                        UX.list(list, null);
                    });
                };

                show();
                setInterval(show, 900);
                return false;
            }

            return cb ? cb(null, list) : this.speedList(null);
        });
    };

    /**
     * Kill Daemon
     *
     * @param {Function} cb Callback
     */
    killDaemon = function (cb) {
        process.env.PM2_STATUS = "stopping";

        this.Client.executeRemote("notifyKillPM2", {}, function () { 
            // do nothing
        });

        Common.printOut(conf.PREFIX_MSG + "[v] Modules Stopped");

        this._operate("deleteProcessId", "all", (err, list) => {
            Common.printOut(conf.PREFIX_MSG + "[v] All Applications Stopped");
            process.env.PM2_SILENT = "false";

            this.killAgent((err, data) => {
                if (!err) {
                    Common.printOut(conf.PREFIX_MSG + "[v] Agent Stopped");
                }

                this.Client.killDaemon((err, res) => {
                    if (err) {
                        Common.printError(err);
                    }
                    Common.printOut(conf.PREFIX_MSG + "[v] PM2 Daemon Stopped");
                    return cb ? cb(err, res) : this.exitCli(conf.SUCCESS_EXIT);
                });

            });
        });
    };

    kill = function (cb) {
        this.killDaemon(cb);
    };

    /////////////////////
    // Private methods //
    /////////////////////

    /**
     * Method to START / RESTART a script
     *
     * @private
     * @param {string} script script name (will be resolved according to location)
     */
    _startScript = function (script, opts, cb) {
        if (typeof opts == "function") {
            cb = opts;
            opts = {};
        }

        /**
         * Commander.js tricks
         */
        let app_conf: any = Config.filterOptions(opts);
        let appConf = {};

        if (typeof app_conf.name == "function") {
            delete app_conf.name;
        }

        delete app_conf.args;

        // Retrieve arguments via -- <args>
        let argsIndex;

        if (opts.rawArgs && (argsIndex = opts.rawArgs.indexOf("--")) >= 0) {
            app_conf.args = opts.rawArgs.slice(argsIndex + 1);
        } else if (opts.scriptArgs) {
            app_conf.args = opts.scriptArgs;
        }

        app_conf.script = script;
        if (!app_conf.namespace) {
            app_conf.namespace = "default";
        }

        if ((appConf = Common.verifyConfs(app_conf)) instanceof Error) {
            Common.err(appConf);
            return cb ? cb(Common.retErr(appConf)) : this.exitCli(conf.ERROR_EXIT);
        }

        app_conf = appConf[0];

        if (opts.watchDelay) {
            if (typeof opts.watchDelay === "string" && opts.watchDelay.indexOf("ms") !== -1) {
                app_conf.watch_delay = parseInt(opts.watchDelay);
            } else {
                app_conf.watch_delay = parseFloat(opts.watchDelay) * 1000;
            }
        }

        const mas = [];
        if (typeof opts.ext != "undefined") {
            hf.make_available_extension(opts, mas); // for -e flag
        }
        mas.length > 0 ? app_conf.ignore_watch = mas : 0;

        /**
         * If -w option, write configuration to configuration.json file
         */
        if (app_conf.write) {
            const dst_path = path.join(process.env.PWD || process.cwd(), app_conf.name + "-pm2.json");
            Common.printOut(conf.PREFIX_MSG + "Writing configuration to", chalk.blue(dst_path));
            // pretty JSON
            try {
                fs.writeFileSync(dst_path, JSON.stringify(app_conf, null, 2));
            } catch (e) {
                console.error(e.stack || e);
            }
        }

        /**
         * If start <app_name> start/restart application
         */
        const restartExistingProcessName = (cb) => {
            if (!isNaN(script) ||
                (typeof script === "string" && script.indexOf("/") != -1) ||
                (typeof script === "string" && path.extname(script) !== "")) {
                return cb(null);
            }

            this.Client.getProcessIdByName(script, (err, ids) => {
                if (err && cb) {
                    return cb(err);
                }
                if (ids.length > 0) {
                    this._operate("restartProcessId", script, opts, function (err, list) {
                        if (err) {
                            return cb(err);
                        }
                        Common.printOut(conf.PREFIX_MSG + "Process successfully started");
                        return cb(true, list);
                    });
                } else {
                    return cb(null);
                }
            });
        };

        /**
         * If start <namespace> start/restart namespace
         */
        function restartExistingNameSpace(cb) {
            if (!isNaN(script) ||
                (typeof script === "string" && script.indexOf("/") != -1) ||
                (typeof script === "string" && path.extname(script) !== "")) {
                return cb(null);
            }

            if (script !== "all") {
                this.Client.getProcessIdsByNamespace(script, (err, ids) => {
                    if (err && cb) {
                        return cb(err);
                    }
                    if (ids.length > 0) {
                        this._operate("restartProcessId", script, opts, function (err, list) {
                            if (err) {
                                return cb(err);
                            }
                            Common.printOut(conf.PREFIX_MSG + "Process successfully started");
                            return cb(true, list);
                        });
                    } else {
                        return cb(null);
                    }
                });
            } else {
                this._operate("restartProcessId", "all", function (err, list) {
                    if (err) {
                        return cb(err);
                    }
                    Common.printOut(conf.PREFIX_MSG + "Process successfully started");
                    return cb(true, list);
                });
            }
        }

        const restartExistingProcessId = (cb) => {
            if (isNaN(script)) {
                return cb(null);
            }

            this._operate("restartProcessId", script, opts, function (err, list) {
                if (err) {
                    return cb(err);
                }
                Common.printOut(conf.PREFIX_MSG + "Process successfully started");
                return cb(true, list);
            });
        };

        /**
         * Restart a process with the same full path
         * Or start it
         */
        const restartExistingProcessPathOrStartNew = (cb) => {
            this.Client.executeRemote("getMonitorData", {}, (err, procs) => {
                if (err) {
                    return cb ? cb(new Error(err)) : this.exitCli(conf.ERROR_EXIT);
                }

                const full_path = path.resolve(this.cwd, script);
                let managed_script = null;

                procs.forEach(function (proc) {
                    if (proc.pm2_env.pm_exec_path == full_path &&
                        proc.pm2_env.name == app_conf.name) {
                        managed_script = proc;
                    }
                });

                if (managed_script &&
                    (managed_script.pm2_env.status == conf.STOPPED_STATUS ||
                        managed_script.pm2_env.status == conf.STOPPING_STATUS ||
                        managed_script.pm2_env.status == conf.ERRORED_STATUS)) {
                    // Restart process if stopped
                    const app_name = managed_script.pm2_env.name;

                    this._operate("restartProcessId", app_name, opts, (err, list) => {
                        if (err) {
                            return cb ? cb(new Error(err)) : this.exitCli(conf.ERROR_EXIT);
                        }
                        Common.printOut(conf.PREFIX_MSG + "Process successfully started");
                        return cb(true, list);
                    });
                    return false;
                } else if (managed_script && !opts.force) {
                    Common.err("Script already launched, add -f option to force re-execution");
                    return cb(new Error("Script already launched"));
                }

                let resolved_paths = null;

                try {
                    resolved_paths = Common.resolveAppAttributes({
                        cwd: this.cwd,
                        pm2_home: this.pm2_home
                    }, app_conf);
                } catch (e) {
                    Common.err(e.message);
                    return cb(Common.retErr(e));
                }

                Common.printOut(conf.PREFIX_MSG + "Starting %s in %s (%d instance" + (resolved_paths.instances > 1 ? "s" : "") + ")",
                    resolved_paths.pm_exec_path, resolved_paths.exec_mode, resolved_paths.instances);

                if (!resolved_paths.env) {
                    resolved_paths.env = {};
                }

                // Set PM2 HOME in case of child process using PM2 API
                resolved_paths.env["PM2_HOME"] = this.pm2_home;

                const additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
                resolved_paths.env = Object.assign({}, resolved_paths.env, additional_env);

                // Is KM linked?
                resolved_paths.km_link = this.gl_is_km_linked;

                this.Client.executeRemote("prepare", resolved_paths, function (err, data) {
                    if (err) {
                        Common.printError(conf.PREFIX_MSG_ERR + "Error while launching application", err.stack || err);
                        return cb(Common.retErr(err));
                    }

                    Common.printOut(conf.PREFIX_MSG + "Done.");
                    return cb(true, data);
                });
                return false;
            });
        };

        series([
            restartExistingProcessName,
            restartExistingNameSpace,
            restartExistingProcessId,
            restartExistingProcessPathOrStartNew
        ], (err, data) => {
            if (err instanceof Error) {
                return cb ? cb(err) : this.exitCli(conf.ERROR_EXIT);
            }

            let ret = {};

            data.forEach(function (_dt) {
                if (_dt !== undefined) {
                    ret = _dt;
                }
            });

            return cb ? cb(null, ret) : this.speedList();
        });
    };

    /**
     * Method to start/restart/reload processes from a JSON file
     * It will start app not started
     * Can receive only option to skip applications
     *
     * @private
     */
    _startJson = function (file, opts, action, pipe?, cb?) {
        let config: any = {};
        let appConf: any[] = [];
        let staticConf = [];
        let deployConf = {};
        let apps_info = [];

        /**
         * Get File configuration
         */
        if (typeof (cb) === "undefined" && typeof (pipe) === "function") {
            cb = pipe;
        }
        if (typeof (file) === "object") {
            config = file;
        } else if (pipe === "pipe") {
            config = Common.parseConfig(file, "pipe");
        } else {
            let data = null;

            const isAbsolute = path.isAbsolute(file);
            const file_path = isAbsolute ? file : path.join(this.cwd, file);

            debug("Resolved filepath %s", file_path);

            try {
                data = fs.readFileSync(file_path);
            } catch (e) {
                Common.printError(conf.PREFIX_MSG_ERR + "File " + file + " not found");
                return cb ? cb(Common.retErr(e)) : this.exitCli(conf.ERROR_EXIT);
            }

            try {
                config = Common.parseConfig(data, file);
            } catch (e) {
                Common.printError(conf.PREFIX_MSG_ERR + "File " + file + " malformated");
                console.error(e);
                return cb ? cb(Common.retErr(e)) : this.exitCli(conf.ERROR_EXIT);
            }
        }

        /**
         * Alias some optional fields
         */
        if (config.deploy) {
            deployConf = config.deploy;
        }
        if (config.static) {
            staticConf = config.static;
        }
        if (config.apps) {
            appConf = config.apps;
        } else if (config.pm2) {
            appConf = config.pm2;
        } else {
            appConf = config;
        }
        if (!Array.isArray(appConf)) {
            appConf = [appConf];
        }

        const verConf = Common.verifyConfs(appConf);
        if (verConf instanceof Error) {
            return cb ? cb(verConf) : this.exitCli(conf.ERROR_EXIT);
        }

        process.env.PM2_JSON_PROCESSING = "true";

        // Get App list
        const apps_name = [];
        const proc_list = {};

        // Add statics to apps
        staticConf.forEach(function (serve) {
            appConf.push({
                name: serve.name ? serve.name : `static-page-server-${serve.port}`,
                script: path.resolve(__dirname, "API", "Serve.js"),
                env: {
                    PM2_SERVE_PORT: serve.port,
                    PM2_SERVE_HOST: serve.host,
                    PM2_SERVE_PATH: serve.path,
                    PM2_SERVE_SPA: serve.spa,
                    PM2_SERVE_DIRECTORY: serve.directory,
                    PM2_SERVE_BASIC_AUTH: serve.basic_auth !== undefined,
                    PM2_SERVE_BASIC_AUTH_USERNAME: serve.basic_auth ? serve.basic_auth.username : null,
                    PM2_SERVE_BASIC_AUTH_PASSWORD: serve.basic_auth ? serve.basic_auth.password : null,
                    PM2_SERVE_MONITOR: serve.monitor
                }
            });
        });

        // Here we pick only the field we want from the CLI when starting a JSON
        appConf.forEach((app) => {
            if (!app.env) {
                app.env = {}; 
            }
            app.env.io = app.io;
            // --only <app>
            if (opts.only) {
                const apps = opts.only.split(/,| /);
                if (apps.indexOf(app.name) == -1) {
                    return false;
                }
            }
            // Namespace
            if (!app.namespace) {
                if (opts.namespace) {
                    app.namespace = opts.namespace;
                } else {
                    app.namespace = "default";
                }
            }
            // --watch
            if (!app.watch && opts.watch && opts.watch === true) {
                app.watch = true;
            }
            // --ignore-watch
            if (!app.ignore_watch && opts.ignore_watch) {
                app.ignore_watch = opts.ignore_watch;
            }
            if (opts.install_url) {
                app.install_url = opts.install_url;
            }
            // --instances <nb>
            if (opts.instances && typeof (opts.instances) === "number") {
                app.instances = opts.instances;
            }
            // --uid <user>
            if (opts.uid) {
                app.uid = opts.uid;
            }
            // --gid <user>
            if (opts.gid) {
                app.gid = opts.gid;
            }
            // Specific
            if (app.append_env_to_name && opts.env) {
                app.name += ("-" + opts.env);
            }
            if (opts.name_prefix && app.name.indexOf(opts.name_prefix) == -1) {
                app.name = `${opts.name_prefix}:${app.name}`;
            }

            app.username = Common.getCurrentUsername();
            apps_name.push(app.name);
        });

        this.Client.executeRemote("getMonitorData", {}, (err, raw_proc_list) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }

            /**
             * Uniquify in memory process list
             */
            raw_proc_list.forEach(function (proc) {
                proc_list[proc.name] = proc;
            });

            /**
             * Auto detect application already started
             * and act on them depending on action
             */
            eachLimit(Object.keys(proc_list), conf.CONCURRENT_ACTIONS, (proc_name, next) => {
                // Skip app name (--only option)
                if (apps_name.indexOf(proc_name) == -1) {
                    return next();
                }

                if (!(action == "reloadProcessId" ||
                    action == "softReloadProcessId" ||
                    action == "restartProcessId")) {
                    throw new Error("Wrong action called");
                }

                const apps = appConf.filter(function (app) {
                    return app.name == proc_name;
                });

                const envs = apps.map(function (app) {
                    // Binds env_diff to env and returns it.
                    return Common.mergeEnvironmentVariables(app, opts.env, deployConf);
                });

                // Assigns own enumerable properties of all
                // Notice: if people use the same name in different apps,
                //         duplicated envs will be overrode by the last one
                const env = envs.reduce(function (e1, e2) {
                    e1 = { ...e1, ...e2 };
                    return e1;
                });

                // When we are processing JSON, allow to keep the new env by default
                env.updateEnv = true;

                // Pass `env` option
                this._operate(action, proc_name, env, (err, ret) => {
                    if (err) {
                        Common.printError(err);
                    }

                    // For return
                    apps_info = apps_info.concat(ret);

                    this.Client.notifyGod(action, proc_name);
                    // And Remove from array to spy
                    apps_name.splice(apps_name.indexOf(proc_name), 1);
                    return next();
                });

            }, (err) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                if (apps_name.length > 0 && action != "start") {
                    Common.printOut(conf.PREFIX_MSG_WARNING + "Applications %s not running, starting...", apps_name.join(", "));
                }
                // Start missing apps
                return startApps(apps_name, (err, apps) => {
                    apps_info = apps_info.concat(apps);
                    return cb ? cb(err, apps_info) : this.speedList(err ? 1 : 0);
                });
            });
            return false;
        });

        const startApps = (app_name_to_start, cb) => {
            const apps_to_start = [];
            let apps_started = [];
            const apps_errored = [];

            appConf.forEach(function (app, i) {
                if (app_name_to_start.indexOf(app.name) != -1) {
                    apps_to_start.push(appConf[i]);
                }
            });

            eachLimit(apps_to_start, conf.CONCURRENT_ACTIONS, (app, next) => {
                if (opts.cwd) {
                    app.cwd = opts.cwd;
                }
                if (opts.force_name) {
                    app.name = opts.force_name;
                }
                if (opts.started_as_module) {
                    app.pmx_module = true;
                }

                let resolved_paths = null;

                // hardcode script name to use `serve` feature inside a process file
                if (app.script === "serve") {
                    app.script = path.resolve(__dirname, "API", "Serve.js");
                }

                try {
                    resolved_paths = Common.resolveAppAttributes({
                        cwd: this.cwd,
                        pm2_home: this.pm2_home
                    }, app);
                } catch (e) {
                    apps_errored.push(e);
                    Common.err(`Error: ${e.message}`);
                    return next();
                }

                if (!resolved_paths.env) {
                    resolved_paths.env = {};
                }

                // Set PM2 HOME in case of child process using PM2 API
                resolved_paths.env["PM2_HOME"] = this.pm2_home;

                const additional_env = Modularizer.getAdditionalConf(resolved_paths.name);
                resolved_paths.env = { ...(resolved_paths.env || {}), ...(additional_env || {}) };

                resolved_paths.env = Common.mergeEnvironmentVariables(resolved_paths, opts.env, deployConf);

                delete resolved_paths.env.current_conf;

                // Is KM linked?
                resolved_paths.km_link = this.gl_is_km_linked;

                if (resolved_paths.wait_ready) {
                    Common.warn(`App ${resolved_paths.name} has option 'wait_ready' set, waiting for app to be ready...`);
                }
                this.Client.executeRemote("prepare", resolved_paths, (err, data) => {
                    if (err) {
                        Common.printError(conf.PREFIX_MSG_ERR + "Process failed to launch %s", err.message ? err.message : err);
                        return next();
                    }
                    if (data.length === 0) {
                        Common.printError(conf.PREFIX_MSG_ERR + "Process config loading failed", data);
                        return next();
                    }

                    Common.printOut(conf.PREFIX_MSG + "App [%s] launched (%d instances)", data[0].pm2_env.name, data.length);
                    apps_started = apps_started.concat(data);
                    next();
                });

            }, (err) => {
                const final_error = err || apps_errored.length > 0 ? apps_errored : null;
                return cb ? cb(final_error, apps_started) : this.speedList();
            });
            return false;
        };
    };

    /**
     * Apply a RPC method on the json file
     * @private
     * @method actionFromJson
     * @param {string} action RPC Method
     * @param {object} options
     * @param {string|object} file file
     * @param {string} jsonVia action type (=only 'pipe' ?)
     * @param {Function}
     */
    actionFromJson = function (action, file, opts, jsonVia, cb) {
        let appConf: any = {};
        const ret_processes = [];

        //accept programmatic calls
        if (typeof file == "object") {
            cb = typeof jsonVia == "function" ? jsonVia : cb;
            appConf = file;
        } else if (jsonVia == "file") {
            let data = null;

            try {
                data = fs.readFileSync(file);
            } catch (e) {
                Common.printError(conf.PREFIX_MSG_ERR + "File " + file + " not found");
                return cb ? cb(Common.retErr(e)) : this.exitCli(conf.ERROR_EXIT);
            }

            try {
                appConf = Common.parseConfig(data, file);
            } catch (e) {
                Common.printError(conf.PREFIX_MSG_ERR + "File " + file + " malformated");
                console.error(e);
                return cb ? cb(Common.retErr(e)) : this.exitCli(conf.ERROR_EXIT);
            }
        } else if (jsonVia == "pipe") {
            appConf = Common.parseConfig(file, "pipe");
        } else {
            Common.printError("Bad call to actionFromJson, jsonVia should be one of file, pipe");
            return this.exitCli(conf.ERROR_EXIT);
        }

        // Backward compatibility
        if (appConf.apps) {
            appConf = appConf.apps;
        }

        if (!Array.isArray(appConf)) {
            appConf = [appConf];
        }

        if ((appConf = Common.verifyConfs(appConf)) instanceof Error) {
            return cb ? cb(appConf) : this.exitCli(conf.ERROR_EXIT);
        }

        eachLimit(appConf, conf.CONCURRENT_ACTIONS, (proc, next1) => {
            let name = "";
            let new_env;

            if (!proc.name) {
                name = path.basename(proc.script);
            } else {
                name = proc.name;
            }

            if (opts.only && opts.only != name) {
                return process.nextTick(next1);
            }

            if (opts && opts.env) {
                new_env = Common.mergeEnvironmentVariables(proc, opts.env);
            } else {
                new_env = Common.mergeEnvironmentVariables(proc);
            }

            this.Client.getProcessIdByName(name, (err, ids) => {
                if (err) {
                    Common.printError(err);
                    return next1();
                }
                if (!ids) {
                    return next1();
                }

                eachLimit(ids, conf.CONCURRENT_ACTIONS, (id, next2) => {
                    let opts = {};

                    //stopProcessId could accept options to?
                    if (action == "restartProcessId") {
                        opts = { id: id, env: new_env };
                    } else {
                        opts = id;
                    }

                    this.Client.executeRemote(action, opts, (err, res) => {
                        ret_processes.push(res);
                        if (err) {
                            Common.printError(err);
                            return next2();
                        }

                        if (action == "restartProcessId") {
                            this.Client.notifyGod("restart", id);
                        } else if (action == "deleteProcessId") {
                            this.Client.notifyGod("delete", id);
                        } else if (action == "stopProcessId") {
                            this.Client.notifyGod("stop", id);
                        }

                        Common.printOut(conf.PREFIX_MSG + "[%s](%d) \u2713", name, id);
                        return next2();
                    });
                }, function (err) {
                    return next1(null, ret_processes);
                });
            });
        }, (err) => {
            if (cb) {
                return cb(null, ret_processes);
            } else {
                return this.speedList();
            }
        });
    };


    /**
     * Main function to operate with PM2 daemon
     *
     * @param {String} action_name  Name of action (restartProcessId, deleteProcessId, stopProcessId)
     * @param {String} process_name can be 'all', a id integer or process name
     * @param {Object} envs         object with CLI options / environment
     */
    _operate = function (action_name, process_name, envs, cb?) {
        let update_env = false;
        const ret = [];

        // Make sure all options exist
        if (!envs) {
            envs = {};
        }

        if (typeof (envs) == "function") {
            cb = envs;
            envs = {};
        }

        // Set via env.update (JSON processing)
        if (envs.updateEnv === true) {
            update_env = true;
        }

        let concurrent_actions = envs.parallel || conf.CONCURRENT_ACTIONS;

        if (!process.env.PM2_JSON_PROCESSING || envs.commands) {
            envs = this._handleAttributeUpdate(envs);
        }

        /**
         * Set current updated configuration if not passed
         */
        if (!envs.current_conf) {
            const _conf = fclone(envs);
            envs = {
                current_conf: _conf
            };

            // Is KM linked?
            envs.current_conf.km_link = this.gl_is_km_linked;
        }

        /**
         * Operate action on specific process id
         */
        const processIds = (ids, cb) => {
            Common.printOut(conf.PREFIX_MSG + "Applying action %s on app [%s](ids: %s)", action_name, process_name, ids);

            if (ids.length <= 2) {
                concurrent_actions = 1;
            }

            if (action_name == "deleteProcessId") {
                concurrent_actions = 10;
            }

            eachLimit(ids, concurrent_actions, (id, next) => {
                let opts;

                // These functions need extra param to be passed
                if (action_name == "restartProcessId" ||
                    action_name == "reloadProcessId" ||
                    action_name == "softReloadProcessId") {
                    let new_env: any = {};

                    if (update_env === true) {
                        if (conf.PM2_PROGRAMMATIC == true) {
                            new_env = Common.safeExtend({}, process.env);
                        } else {
                            new_env = Object.assign({}, process.env);
                        }

                        Object.keys(envs).forEach(function (k) {
                            new_env[k] = envs[k];
                        });
                    } else {
                        new_env = envs;
                    }

                    opts = {
                        id: id,
                        env: new_env
                    };
                } else {
                    opts = id;
                }

                this.Client.executeRemote(action_name, opts, (err, res) => {
                    if (err) {
                        Common.printError(conf.PREFIX_MSG_ERR + "Process %s not found", id);
                        return next(`Process ${id} not found`);
                    }

                    if (action_name == "restartProcessId") {
                        this.Client.notifyGod("restart", id);
                    } else if (action_name == "deleteProcessId") {
                        this.Client.notifyGod("delete", id);
                    } else if (action_name == "stopProcessId") {
                        this.Client.notifyGod("stop", id);
                    } else if (action_name == "reloadProcessId") {
                        this.Client.notifyGod("reload", id);
                    } else if (action_name == "softReloadProcessId") {
                        this.Client.notifyGod("graceful reload", id);
                    }

                    if (!Array.isArray(res)) {
                        res = [res];
                    }

                    // Filter return
                    res.forEach(function (proc) {
                        Common.printOut(conf.PREFIX_MSG + "[%s](%d) \u2713", proc.pm2_env ? proc.pm2_env.name : process_name, id);

                        if (action_name == "stopProcessId" && proc.pm2_env && proc.pm2_env.cron_restart) {
                            Common.warn(`App ${chalk.bold(proc.pm2_env.name)} stopped but CRON RESTART is still UP ${proc.pm2_env.cron_restart}`);
                        }

                        if (!proc.pm2_env) {
                            return false;
                        }

                        ret.push({
                            name: proc.pm2_env.name,
                            namespace: proc.pm2_env.namespace,
                            pm_id: proc.pm2_env.pm_id,
                            status: proc.pm2_env.status,
                            restart_time: proc.pm2_env.restart_time,
                            pm2_env: {
                                name: proc.pm2_env.name,
                                namespace: proc.pm2_env.namespace,
                                pm_id: proc.pm2_env.pm_id,
                                status: proc.pm2_env.status,
                                restart_time: proc.pm2_env.restart_time,
                                env: proc.pm2_env.env
                            }
                        });
                    });

                    return next();
                });
            }, (err) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                return cb ? cb(null, ret) : this.speedList();
            });
        };

        if (process_name == "all") {
            // When using shortcuts like 'all', do not delete modules
            if (process.env.PM2_STATUS == "stopping") {
                this.Client.getAllProcessId(function (err, ids) {
                    reoperate(err, ids);
                });
            } else {
                this.Client.getAllProcessIdWithoutModules((err, ids) => {
                    reoperate(err, ids);
                });
            }

            const reoperate = (err, ids) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                if (!ids || ids.length === 0) {
                    Common.printError(conf.PREFIX_MSG_WARNING + "No process found");
                    return cb ? cb(new Error("process name not found")) : this.exitCli(conf.ERROR_EXIT);
                }
                return processIds(ids, cb);
            };
        } else if (isNaN(process_name) && process_name[0] === "/" && process_name[process_name.length - 1] === "/") {
            const regex = new RegExp(process_name.replace(/\//g, ""));

            this.Client.executeRemote("getMonitorData", {}, (err, list) => {
                if (err) {
                    Common.printError("Error retrieving process list: " + err);
                    return cb(err);
                }
                const found_proc = [];
                list.forEach(function (proc) {
                    if (regex.test(proc.pm2_env.name)) {
                        found_proc.push(proc.pm_id);
                    }
                });

                if (found_proc.length === 0) {
                    Common.printError(conf.PREFIX_MSG_WARNING + "No process found");
                    return cb ? cb(new Error("process name not found")) : this.exitCli(conf.ERROR_EXIT);
                }

                return processIds(found_proc, cb);
            });
        } else if (isNaN(process_name)) {
            /**
             * We can not stop or delete a module but we can restart it
             * to refresh configuration variable
             */
            const allow_module_restart = action_name == "restartProcessId" ? true : false;

            this.Client.getProcessIdByName(process_name, allow_module_restart, (err, ids) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                }
                if (ids && ids.length > 0) {
                    /**
                     * Determine if the process to restart is a module
                     * if yes load configuration variables and merge with the current environment
                     */
                    const additional_env = Modularizer.getAdditionalConf(process_name);
                    envs = { ...envs, ...additional_env };
                    return processIds(ids, cb);
                }

                this.Client.getProcessIdsByNamespace(process_name, allow_module_restart, (err, ns_process_ids) => {
                    if (err) {
                        Common.printError(err);
                        return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                    }
                    if (!ns_process_ids || ns_process_ids.length === 0) {
                        Common.printError(conf.PREFIX_MSG_ERR + "Process or Namespace %s not found", process_name);
                        return cb ? cb(new Error("process or namespace not found")) : this.exitCli(conf.ERROR_EXIT);
                    }

                    /**
                     * Determine if the process to restart is a module
                     * if yes load configuration variables and merge with the current environment
                     */
                    const ns_additional_env = Modularizer.getAdditionalConf(process_name);
                    envs = { ...envs, ...ns_additional_env };
                    return processIds(ns_process_ids, cb);
                });
            });
        } else {
            if (this.pm2_configuration.docker == "true" ||
                this.pm2_configuration.docker == true) {
                // Docker/Systemd process interaction detection
                this.Client.executeRemote("getMonitorData", {}, (err, proc_list) => {
                    let higher_id = 0;
                    proc_list.forEach(p => {
                        p.pm_id > higher_id ? higher_id = p.pm_id : null; 
                    });

                    // Is Docker/Systemd
                    if (process_name > higher_id) {
                        return DockerMgmt.processCommand(this, higher_id, process_name, action_name, (err) => {
                            if (err) {
                                Common.printError(conf.PREFIX_MSG_ERR + (err.message ? err.message : err));
                                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
                            }

                            return cb ? cb(null, ret) : this.speedList();
                        });
                    }

                    // Check if application name as number is an app name
                    this.Client.getProcessIdByName(process_name, (err, ids) => {
                        if (ids.length > 0) {
                            return processIds(ids, cb);
                        }

                        // Check if application name as number is an namespace
                        this.Client.getProcessIdsByNamespace(process_name, (err, ns_process_ids) => {
                            if (ns_process_ids.length > 0) {
                                return processIds(ns_process_ids, cb);
                            }
                            // Else operate on pm id
                            return processIds([process_name], cb);
                        });
                    });
                });
            } else {
                // Check if application name as number is an app name
                this.Client.getProcessIdByName(process_name, (err, ids) => {
                    if (ids.length > 0) {
                        return processIds(ids, cb);
                    }

                    // Check if application name as number is an namespace
                    this.Client.getProcessIdsByNamespace(process_name, function (err, ns_process_ids) {
                        if (ns_process_ids.length > 0) {
                            return processIds(ns_process_ids, cb);
                        }
                        // Else operate on pm id
                        return processIds([process_name], cb);
                    });
                });
            }
        }
    };

    /**
     * Converts CamelCase Commander.js arguments
     * to Underscore
     * (nodeArgs -> node_args)
     */
    _handleAttributeUpdate = function (opts) {
        const conf: any = Config.filterOptions(opts);
        if (typeof (conf.name) != "string") {
            delete conf.name;
        }

        let argsIndex = 0;
        if (opts.rawArgs && (argsIndex = opts.rawArgs.indexOf("--")) >= 0) {
            conf.args = opts.rawArgs.slice(argsIndex + 1);
        }

        const appConf = Common.verifyConfs(conf)[0];

        if (appConf instanceof Error) {
            Common.printError("Error while transforming CamelCase args to underscore");
            return appConf;
        }

        if (argsIndex == -1) {
            delete appConf.args;
        }
        if (appConf.name == "undefined") {
            delete appConf.name;
        }

        delete appConf.exec_mode;

        if (util.isArray(appConf.watch) && appConf.watch.length === 0) {
            if (!~opts.rawArgs.indexOf("--watch")) {
                delete appConf.watch;
            }
        }

        // Options set via environment variables
        if (process.env.PM2_DEEP_MONITORING) {
            appConf.deep_monitoring = true;
        }

        // Force deletion of defaults values set by commander
        // to avoid overriding specified configuration by user
        if (appConf.treekill === true) {
            delete appConf.treekill;
        }
        if (appConf.pmx === true) {
            delete appConf.pmx;
        }
        if (appConf.vizion === true) {
            delete appConf.vizion;
        }
        if (appConf.automation === true) {
            delete appConf.automation;
        }
        if (appConf.autorestart === true) {
            delete appConf.autorestart;
        }

        return appConf;
    };

    getProcessIdByName = function (name, cb?) {
        this.Client.getProcessIdByName(name, (err, id) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }
            console.log(id);
            return cb ? cb(null, id) : this.exitCli(conf.SUCCESS_EXIT);
        });
    };

    /**
     * Description
     * @method jlist
     * @param {} debug
     * @return
     */
    jlist = function (debug?) {
        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(err);
                return this.exitCli(conf.ERROR_EXIT);
            }

            if (debug) {
                process.stdout.write(util.inspect(list, false, null, false));
            } else {
                process.stdout.write(JSON.stringify(list));
            }

            this.exitCli(conf.SUCCESS_EXIT);
        });
    };

    /**
     * Display system information
     * @method slist
     * @return
     */
    slist = function (tree) {
        this.Client.executeRemote("getSystemData", {}, (err, sys_infos) => {
            if (err) {
                Common.err(err);
                return this.exitCli(conf.ERROR_EXIT);
            }

            if (tree === true) {
                // console.log(treeify.asTree(sys_infos, true))
            } else {
                process.stdout.write(util.inspect(sys_infos, false, null, false));
            }
            this.exitCli(conf.SUCCESS_EXIT);
        });
    };

    /**
     * Description
     * @method speedList
     * @return
     */
    speedList = (code?, apps_acted?) => {
        // const systemdata = null;
        const acted = [];

        if ((code != 0 && code != null)) {
            return this.exitCli(code ? code : conf.SUCCESS_EXIT);
        }

        if (apps_acted && apps_acted.length > 0) {
            apps_acted.forEach(proc => {
                acted.push(proc.pm2_env ? proc.pm2_env.pm_id : proc.pm_id);
            });
        }

        const doList = (err, list, sys_infos) => {
            if (err) {
                if (this.gl_retry == 0) {
                    this.gl_retry += 1;
                    return setTimeout(this.speedList.bind(this), 1400);
                }
                console.error("Error retrieving process list: %s.\nA process seems to be on infinite loop, retry in 5 seconds", err);
                return this.exitCli(conf.ERROR_EXIT);
            }
            if (process.stdout.isTTY === false) {
                UX.list_min(list);
            } else if (commander.miniList && !commander.silent) {
                UX.list_min(list);
            } else if (!commander.silent) {
                if (this.gl_interact_infos) {
                    let dashboard_url = `https://app.pm2.io/#/r/${this.gl_interact_infos.public_key}`;

                    if (this.gl_interact_infos.info_node != "https://root.keymetrics.io") {
                        dashboard_url = `${this.gl_interact_infos.info_node}/#/r/${this.gl_interact_infos.public_key}`;
                    }

                    Common.printOut("%s PM2+ activated | Instance Name: %s | Dash: %s",
                        chalk.green.bold("⇆"),
                        chalk.bold(this.gl_interact_infos.machine_name),
                        chalk.bold(dashboard_url));
                }
                UX.list(list, sys_infos);
                //Common.printOut(chalk.white.italic(' Use `pm2 show <id|name>` to get more details about an app'));
            }

            if (this.Client.daemon_mode == false) {
                Common.printOut("[--no-daemon] Continue to stream logs");
                Common.printOut("[--no-daemon] Exit on target PM2 exit pid=" + fs.readFileSync(conf.PM2_PID_FILE_PATH).toString());
                global["_auto_exit"] = true;
                return this.streamLogs("all", 0, false, "HH:mm:ss", false);
            } else if (!process.env.TRAVIS && process.env.NODE_ENV != "test" && acted.length > 0 && (commander.attach === true)) {
            // if (process.stdout.isTTY) if looking for start logs
                
                Common.info(`Log streaming apps id: ${chalk.cyan(acted.join(" "))}, exit with Ctrl-C or will exit in 10secs`);

                // setTimeout(() => {
                //   Common.info(`Log streaming exited automatically, run 'pm2 logs' to continue watching logs`)
                //   return that.exitCli(code ? code : conf.SUCCESS_EXIT);
                // }, 10000)

                return acted.forEach((proc_name) => {
                    this.streamLogs(proc_name, 0, false, null, false);
                });
            } else {
                return this.exitCli(code ? code : conf.SUCCESS_EXIT);
            }
        };

        // Do nothing if PM2 called programmatically and not called from CLI (also in exitCli)
        if ((conf.PM2_PROGRAMMATIC && process.env.PM2_USAGE != "CLI")) {
            return false;
        } else {
            return this.Client.executeRemote("getSystemData", {}, (err, sys_infos) => {
                this.Client.executeRemote("getMonitorData", {}, (err, proc_list) => {
                    doList(err, proc_list, sys_infos);
                });
            });
        }
    };

    /**
     * Scale up/down a process
     * @method scale
     */
    scale = function (app_name, number, cb?) {
        function addProcs(proc, value, cb) {
            (function ex(proc, number) {
                if (number-- === 0) {
                    return cb();
                }
                Common.printOut(conf.PREFIX_MSG + "Scaling up application");
                this.Client.executeRemote("duplicateProcessId", proc.pm2_env.pm_id, ex.bind(this, proc, number));
            })(proc, number);
        }

        const rmProcs = (procs, value, cb) => {
            let i = 0;

            const ex = (procs, number) => {
                if (number++ === 0) {
                    return cb();
                }
                this._operate("deleteProcessId", procs[i++].pm2_env.pm_id, ex.bind(this, procs, number));
            };
            ex(procs, number);
        };

        const end = () => {
            return cb ? cb(null, { success: true }) : this.speedList();
        };

        this.Client.getProcessByName(app_name, (err, procs) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(conf.ERROR_EXIT);
            }

            if (!procs || procs.length === 0) {
                Common.printError(conf.PREFIX_MSG_ERR + "Application %s not found", app_name);
                return cb ? cb(new Error("App not found")) : this.exitCli(conf.ERROR_EXIT);
            }

            const proc_number = procs.length;

            if (typeof (number) === "string" && number.indexOf("+") >= 0) {
                number = parseInt(number, 10);
                return addProcs(procs[0], number, end);
            } else if (typeof (number) === "string" && number.indexOf("-") >= 0) {
                number = parseInt(number, 10);
                return rmProcs(procs[0], number, end);
            } else {
                number = parseInt(number, 10);
                number = number - proc_number;

                if (number < 0) {
                    return rmProcs(procs, number, end);
                } else if (number > 0) {
                    return addProcs(procs[0], number, end);
                } else {
                    Common.printError(conf.PREFIX_MSG_ERR + "Nothing to do");
                    return cb ? cb(new Error("Same process number")) : this.exitCli(conf.ERROR_EXIT);
                }
            }
        });
    };

    /**
     * Description
     * @method describeProcess
     * @param {} pm2_id
     * @return
     */
    describe = (pm2_id, cb?) => {
        const found_proc = [];

        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                this.exitCli(conf.ERROR_EXIT);
            }

            list.forEach(function (proc) {
                if ((!isNaN(pm2_id) && proc.pm_id == pm2_id) ||
                    (typeof (pm2_id) === "string" && proc.name == pm2_id)) {
                    found_proc.push(proc);
                }
            });

            if (found_proc.length === 0) {
                Common.printError(conf.PREFIX_MSG_WARNING + "%s doesn't exist", pm2_id);
                return cb ? cb(null, []) : this.exitCli(conf.ERROR_EXIT);
            }

            if (!cb) {
                found_proc.forEach(function (proc) {
                    UX.describe(proc);
                });
            }

            return cb ? cb(null, found_proc) : this.exitCli(conf.SUCCESS_EXIT);
        });
    };

    /**
     * API method to perform a deep update of PM2
     * @method deepUpdate
     */
    deepUpdate = (cb?) => {
        Common.printOut(conf.PREFIX_MSG + "Updating PM2...");

        const child: any = sexec("npm i -g pm2@latest; pm2 update");

        child.stdout.on("end", () => {
            Common.printOut(conf.PREFIX_MSG + "PM2 successfully updated");
            cb ? cb(null, { success: true }) : this.exitCli(conf.SUCCESS_EXIT);
        });
    };

    /**
     * From Extra - Start
     */

    /**
     * Get version of the daemonized PM2
     * @method getVersion
     * @callback cb
     */
    getVersion = (cb) => {
        this.Client.executeRemote("getVersion", {}, (...args) => {
            return cb ? cb(...args) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
     * Get version of the daemonized PM2
     * @method getVersion
     * @callback cb
     */
    launchSysMonitoring = (cb?) => {
        this.set("pm2:sysmonit", "true", () => {
            this.Client.executeRemote("launchSysMonitoring", {}, (err) => {
                if (err) {
                    Common.err(err);
                } else {
                    Common.log("System Monitoring launched");
                }
                return cb ? cb(err) : this.exitCli(cst.SUCCESS_EXIT);
            });
        });
    };

    /**
     * Show application environment
     * @method env
     * @callback cb
     */
    env = (app_id, cb?) => {
        // const procs = [];
        let printed = 0;

        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            list.forEach(l => {
                if (app_id == l.pm_id) {
                    printed++;
                    const env = Common.safeExtend({}, l.pm2_env);
                    Object.keys(env).forEach(key => {
                        console.log(`${key}: ${chalk.green(env[key])}`);
                    });
                }
            });

            if (printed == 0) {
                Common.err(`Modules with id ${app_id} not found`);
                return cb ? cb(err) : this.exitCli(cst.ERROR_EXIT);
            }
            return cb ? cb(err) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
     * Get version of the daemonized PM2
     * @method getVersion
     * @callback cb
     */
    report = () => {
        this.Client.executeRemote("getReport", {}, (err, report) => {
            console.log();
            console.log();
            console.log();
            console.log("```");
            fmt.title("PM2 report");
            fmt.field("Date", new Date());
            fmt.sep();
            fmt.title(chalk.bold.blue("Daemon"));
            fmt.field("pm2d version", report.pm2_version);
            fmt.field("node version", report.node_version);
            fmt.field("node path", report.node_path);
            fmt.field("argv", report.argv);
            fmt.field("argv0", report.argv0);
            fmt.field("user", report.user);
            fmt.field("uid", report.uid);
            fmt.field("gid", report.gid);
            fmt.field("uptime", dayjs(new Date()).diff(report.started_at, "minute") + "min");

            fmt.sep();
            fmt.title(chalk.bold.blue("CLI"));
            fmt.field("local pm2", pkg.version);
            fmt.field("node version", process.versions.node);
            fmt.field("node path", process.env["_"] || "not found");
            fmt.field("argv", process.argv);
            fmt.field("argv0", process.argv0);
            fmt.field("user", process.env.USER || process.env.LNAME || process.env.USERNAME);
            if (cst.IS_WINDOWS === false && process.geteuid) {
                fmt.field("uid", process.geteuid());
            }
            if (cst.IS_WINDOWS === false && process.getegid) {
                fmt.field("gid", process.getegid());
            }

            const os = require("os");

            fmt.sep();
            fmt.title(chalk.bold.blue("System info"));
            fmt.field("arch", os.arch());
            fmt.field("platform", os.platform());
            fmt.field("type", os.type());
            fmt.field("cpus", os.cpus()[0].model);
            fmt.field("cpus nb", Object.keys(os.cpus()).length);
            fmt.field("freemem", os.freemem());
            fmt.field("totalmem", os.totalmem());
            fmt.field("home", os.homedir());

            this.Client.executeRemote("getMonitorData", {}, (err, list) => {

                fmt.sep();
                fmt.title(chalk.bold.blue("PM2 list"));
                UX.list(list, this.gl_interact_infos);

                fmt.sep();
                fmt.title(chalk.bold.blue("Daemon logs"));
                Log.tail([{
                    path: cst.PM2_LOG_FILE_PATH,
                    app_name: "PM2",
                    type: "PM2"
                }], 20, false, () => {
                    console.log("```");
                    console.log();
                    console.log();

                    console.log(chalk.bold.green("Please copy/paste the above report in your issue on https://github.com/Unitech/pm2/issues"));

                    console.log();
                    console.log();
                    this.exitCli(cst.SUCCESS_EXIT);
                });
            });
        });
    };

    getPID = (app_name, cb?) => {
        if (typeof (app_name) === "function") {
            cb = app_name;
            app_name = null;
        }

        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(cst.PREFIX_MSG_ERR + err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }

            const pids = [];

            list.forEach(function (app) {
                if (!app_name || app_name == app.name) {
                    pids.push(app.pid);
                }
            });

            if (!cb) {
                Common.printOut(pids.join("\n"));
                return this.exitCli(cst.SUCCESS_EXIT);
            }
            return cb(null, pids);
        });
    };

    /**
     * Create PM2 memory snapshot
     * @method getVersion
     * @callback cb
     */
    profile = function (type, time, cb?) {
        const dayjs = require("dayjs");
        let cmd;

        if (type == "cpu") {
            cmd = {
                ext: ".cpuprofile",
                action: "profileCPU"
            };
        }
        if (type == "mem") {
            cmd = {
                ext: ".heapprofile",
                action: "profileMEM"
            };
        }

        const file = path.join(process.cwd(), dayjs().format("dd-HH:mm:ss") + cmd.ext);
        time = time || 10000;

        console.log(`Starting ${cmd.action} profiling for ${time}ms...`);
        this.Client.executeRemote(cmd.action, {
            pwd: file,
            timeout: time
        }, (err) => {
            if (err) {
                console.error(err);
                return this.exitCli(1);
            }
            console.log(`Profile done in ${file}`);
            return cb ? cb(err) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
     * pm2 create command
     * create boilerplate of application for fast try
     * @method boilerplate
     */
    boilerplate = function (cb?) {
        const projects = [];
        const enquirer = require("enquirer");

        fs.readdir(path.join(__dirname, "../../templates/sample-apps"), (err, items) => {
            require("async").forEach(items, (app, next) => {
                const fp = path.join(__dirname, "../../templates/sample-apps", app);
                fs.readFile(path.join(fp, "package.json"), "utf8", (err, dt) => {
                    const meta = JSON.parse(dt);
                    meta.fullpath = fp;
                    meta.folder_name = app;
                    projects.push(meta);
                    next();
                });
            }, () => {
                const prompt = new enquirer.Select({
                    name: "boilerplate",
                    message: "Select a boilerplate",
                    choices: projects.map((p, i) => {
                        return {
                            message: `${chalk.bold.blue(p.name)} ${p.description}`,
                            value: `${i}`
                        };
                    })
                });

                prompt.run()
                    .then(answer => {
                        const p = projects[parseInt(answer)];
                        basicMDHighlight(fs.readFileSync(path.join(p.fullpath, "README.md")).toString());
                        console.log(chalk.bold(`>> Project copied inside folder ./${p.folder_name}/\n`));
                        copyDirSync(p.fullpath, path.join(process.cwd(), p.folder_name));
                        this.start(path.join(p.fullpath, "ecosystem.config.js"), {
                            cwd: p.fullpath
                        }, (err) => {
                            return cb ? cb(err) : this.speedList(cst.SUCCESS_EXIT);
                        });
                    })
                    .catch(e => {
                        return cb ? cb(e) : this.speedList(cst.SUCCESS_EXIT);
                    });

            });
        });
    };

    /**
     * Description
     * @method sendLineToStdin
     */
    sendLineToStdin = function (pm_id, line, separator?, cb?) {
        if (!cb && typeof (separator) == "function") {
            cb = separator;
            separator = null;
        }

        const packet = {
            pm_id: pm_id,
            line: line + (separator || "\n")
        };

        this.Client.executeRemote("sendLineToStdin", packet, (err, res) => {
            if (err) {
                Common.printError(cst.PREFIX_MSG_ERR + err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            return cb ? cb(null, res) : this.speedList();
        });
    };

    /**
     * Description
     * @method attachToProcess
     */
    attach = function (pm_id, separator?, cb?) {
        const readline = require("readline");

        if (isNaN(pm_id)) {
            Common.printError("pm_id must be a process number (not a process name)");
            return cb ? cb(Common.retErr("pm_id must be number")) : this.exitCli(cst.ERROR_EXIT);
        }

        if (typeof (separator) == "function") {
            cb = separator;
            separator = null;
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on("close", () => {
            return cb ? cb() : this.exitCli(cst.SUCCESS_EXIT);
        });

        this.Client.launchBus((err, bus, socket) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }

            bus.on("log:*", function (type, packet) {
                if (packet.process.pm_id !== parseInt(pm_id)) {
                    return;
                }
                process.stdout.write(packet.data);
            });
        });

        rl.on("line", (line) => {
            this.sendLineToStdin(pm_id, line, separator, function () { 
                // do nothing
            });
        });
    };

    /**
     * Description
     * @method sendDataToProcessId
     */
    sendDataToProcessId = function (proc_id, packet, cb) {
        if (typeof proc_id === "object" && typeof packet === "function") {
            // the proc_id is packet.
            cb = packet;
            packet = proc_id;
        } else {
            packet.id = proc_id;
        }

        this.Client.executeRemote("sendDataToProcessId", packet, (err, res) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut("successfully sent data to process");
            return cb ? cb(null, res) : this.speedList();
        });
    };

    /**
     * Used for custom actions, allows to trigger function inside an app
     * To expose a function you need to use keymetrics/pmx
     *
     * @method msgProcess
     * @param {Object} opts
     * @param {String} id           process id
     * @param {String} action_name  function name to trigger
     * @param {Object} [opts.opts]  object passed as first arg of the function
     * @param {String} [uuid]       optional unique identifier when logs are emitted
     *
     */
    msgProcess = function (opts, cb) {
        this.Client.executeRemote("msgProcess", opts, cb);
    };

    /**
     * Trigger a PMX custom action in target application
     * Custom actions allows to interact with an application
     *
     * @method trigger
     * @param  {String|Number} pm_id       process id or application name
     * @param  {String}        action_name name of the custom action to trigger
     * @param  {Mixed}         params      parameter to pass to target action
     * @param  {Function}      cb          callback
     */
    trigger = function (pm_id, action_name, params, cb?) {
        if (typeof (params) === "function") {
            cb = params;
            params = null;
        }
        const cmd: any = {
            msg: action_name
        };
        let counter = 0;
        let process_wait_count = 0;
        const results = [];

        if (params) {
            cmd.opts = params;
        }

        if (isNaN(pm_id)) {
            cmd.name = pm_id;
        } else {
            cmd.id = pm_id;
        }

        this.launchBus((err, bus) => {
            bus.on("axm:reply", (ret) => {
                if (ret.process.name == pm_id || ret.process.pm_id == pm_id || ret.process.namespace == pm_id || pm_id == "all") {
                    results.push(ret);
                    Common.printOut("[%s:%s:%s]=%j", ret.process.name, ret.process.pm_id, ret.process.namespace, ret.data.return);
                    if (++counter == process_wait_count) {
                        return cb ? cb(null, results) : this.exitCli(cst.SUCCESS_EXIT);
                    }
                }
            });

            this.msgProcess(cmd, (err, data) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }

                if (data.process_count == 0) {
                    Common.printError("Not any process has received a command (offline or unexistent)");
                    return cb ? cb(Common.retErr("Unknown process")) : this.exitCli(cst.ERROR_EXIT);
                }

                process_wait_count = data.process_count;
                Common.printOut(chalk.bold("%s processes have received command %s"),
                    data.process_count, action_name);
            });
        });
    };

    /**
     * Description
     * @method sendSignalToProcessName
     * @param {} signal
     * @param {} process_name
     * @return
     */
    sendSignalToProcessName = function (signal, process_name, cb?) {
        this.Client.executeRemote("sendSignalToProcessName", {
            signal: signal,
            process_name: process_name
        }, (err, list) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut("successfully sent signal %s to process name %s", signal, process_name);
            return cb ? cb(null, list) : this.speedList();
        });
    };

    /**
     * Description
     * @method sendSignalToProcessId
     * @param {} signal
     * @param {} process_id
     * @return
     */
    sendSignalToProcessId = function (signal, process_id, cb?) {
        this.Client.executeRemote("sendSignalToProcessId", {
            signal: signal,
            process_id: process_id
        }, (err, list) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut("successfully sent signal %s to process id %s", signal, process_id);
            return cb ? cb(null, list) : this.speedList();
        });
    };

    /**
     * API method to launch a process that will serve directory over http
     */
    autoinstall = function (cb?) {
        const filepath = path.resolve(path.dirname(module.filename), "../Sysinfo/ServiceDetection/ServiceDetection.js");

        this.start(filepath, (err, res) => {
            if (err) {
                Common.printError(cst.PREFIX_MSG_ERR + "Error while trying to serve : " + err.message || err);
                return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
            }
            return cb ? cb(null) : this.speedList();
        });
    };

    /**
     * API method to launch a process that will serve directory over http
     *
     * @param {Object} opts options
     * @param {String} opts.path path to be served
     * @param {Number} opts.port port on which http will bind
     * @param {Boolean} opts.spa single page app served
     * @param {String} opts.basicAuthUsername basic auth username
     * @param {String} opts.basicAuthPassword basic auth password
     * @param {Object} commander commander object
     * @param {Function} cb optional callback
     */
    serve = function (target_path, port, opts, commander, cb?) {
        const servePort = process.env.PM2_SERVE_PORT || port || 8080;
        const servePath = path.resolve(process.env.PM2_SERVE_PATH || target_path || ".");

        const filepath = path.resolve(path.dirname(module.filename), "./Serve.js");

        if (typeof commander.name === "string") {
            opts.name = commander.name;
        } else {
            opts.name = "static-page-server-" + servePort;
        }
        if (!opts.env) {
            opts.env = {};
        }
        opts.env.PM2_SERVE_PORT = servePort;
        opts.env.PM2_SERVE_PATH = servePath;
        opts.env.PM2_SERVE_SPA = opts.spa;
        if (opts.basicAuthUsername && opts.basicAuthPassword) {
            opts.env.PM2_SERVE_BASIC_AUTH = "true";
            opts.env.PM2_SERVE_BASIC_AUTH_USERNAME = opts.basicAuthUsername;
            opts.env.PM2_SERVE_BASIC_AUTH_PASSWORD = opts.basicAuthPassword;
        }
        if (opts.monitor) {
            opts.env.PM2_SERVE_MONITOR = opts.monitor;
        }
        opts.cwd = servePath;

        this.start(filepath, opts, (err, res) => {
            if (err) {
                Common.printError(cst.PREFIX_MSG_ERR + "Error while trying to serve : " + err.message || err);
                return cb ? cb(err) : this.speedList(cst.ERROR_EXIT);
            }
            Common.printOut(cst.PREFIX_MSG + "Serving " + servePath + " on port " + servePort);
            return cb ? cb(null, res) : this.speedList();
        });
    };

    /**
     * Ping daemon - if PM2 daemon not launched, it will launch it
     * @method ping
     */
    ping = function (cb?) {
        this.Client.executeRemote("ping", {}, (err, res) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(new Error(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut(res);
            return cb ? cb(null, res) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };


    /**
     * Execute remote command
     */
    remote = function (command, opts, cb) {
        this[command](opts.name, function (err_cmd, ret) {
            if (err_cmd) {
                console.error(err_cmd);
            }
            console.log("Command %s finished", command);
            return cb(err_cmd, ret);
        });
    };

    /**
     * This remote method allows to pass multiple arguments
     * to PM2
     * It is used for the new scoped PM2 action system
     */
    remoteV2 = function (command, opts, cb) {
        if (this[command].length == 1) {
            return this[command](cb);
        }

        opts.args.push(cb);
        return this[command](opts.args);
    };


    /**
     * Description
     * @method generateSample
     * @param {} name
     * @return
     */
    generateSample = function (mode) {
        let templatePath;

        if (mode == "simple") {
            templatePath = path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL_SIMPLE);
        } else {
            templatePath = path.join(cst.TEMPLATE_FOLDER, cst.APP_CONF_TPL);
        }

        const sample = fs.readFileSync(templatePath);
        const dt = sample.toString();
        const f_name = "ecosystem.config.js";
        const pwd = process.env.PWD || process.cwd();

        try {
            fs.writeFileSync(path.join(pwd, f_name), dt);
        } catch (e) {
            console.error(e.stack || e);
            return this.exitCli(cst.ERROR_EXIT);
        }
        Common.printOut("File %s generated", path.join(pwd, f_name));
        this.exitCli(cst.SUCCESS_EXIT);
    };

    /**
     * Description
     * @method dashboard
     * @return
     */
    dashboard = function (cb?) {
        if (cb) {
            return cb(new Error("Dashboard cant be called programmatically"));
        }

        Dashboard.init();

        this.Client.launchBus((err, bus) => {
            if (err) {
                console.error("Error launchBus: " + err);
                this.exitCli(cst.ERROR_EXIT);
            }
            bus.on("log:*", function (type, data) {
                Dashboard.log(type, data);
            });
        });

        process.on("SIGINT", function () {
            this.Client.disconnectBus(function () {
                process.exit(cst.SUCCESS_EXIT);
            });
        });

        const refreshDashboard = () => {
            this.Client.executeRemote("getMonitorData", {}, (err, list) => {
                if (err) {
                    console.error("Error retrieving process list: " + err);
                    this.exitCli(cst.ERROR_EXIT);
                }

                Dashboard.refresh(list);

                setTimeout(function () {
                    refreshDashboard();
                }, 800);
            });
        };

        refreshDashboard();
    };

    monit = function (cb?) {
        if (cb) {
            return cb(new Error("Monit cant be called programmatically"));
        }

        Monit.init();

        const launchMonitor = () => {
            this.Client.executeRemote("getMonitorData", {}, (err, list) => {
                if (err) {
                    console.error("Error retrieving process list: " + err);
                    this.exitCli(cst.ERROR_EXIT);
                }

                Monit.refresh(list);

                setTimeout(function () {
                    launchMonitor();
                }, 400);
            });
        };

        launchMonitor();
    };

    inspect = function (app_name, cb?) {
        if (semver.satisfies(process.versions.node, ">= 8.0.0")) {
            this.trigger(app_name, "internal:inspect", (err, res) => {

                if (res && res[0]) {
                    if (res[0].data.return === "") {
                        Common.printOut(`Inspect disabled on ${app_name}`);
                    } else {
                        Common.printOut(`Inspect enabled on ${app_name} => go to chrome : chrome://inspect !!!`);
                    }
                } else {
                    Common.printOut(`Unable to activate inspect mode on ${app_name} !!!`);
                }

                this.exitCli(cst.SUCCESS_EXIT);
            });
        } else {
            Common.printOut("Inspect is available for node version >=8.x !");
            this.exitCli(cst.SUCCESS_EXIT);
        }
    };

    /**
     * From Extra - End
     */

    /**
     * From Deploy - Start
     */

    deploy = function (file, commands, cb?) {
        if (file == "help") {
            deployHelper();
            return cb ? cb() : this.exitCli(cst.SUCCESS_EXIT);
        }

        const args = commands.rawArgs;
        let env;

        args.splice(0, args.indexOf("deploy") + 1);

        // Find ecosystem file by default
        if (!Common.isConfigFile(file)) {
            env = args[0];
            const defaultConfigNames = ["ecosystem.config.js", "ecosystem.json", "ecosystem.json5", "package.json"];
            file = Utility.whichFileExists(defaultConfigNames);

            if (!file) {
                Common.printError("Not any default deployment file exists." +
                    " Allowed default config file names are: " + defaultConfigNames.join(", "));
                return cb ? cb("Not any default ecosystem file present") : this.exitCli(cst.ERROR_EXIT);
            }
        } else {
            env = args[1];
        }

        let json_conf = null;

        try {
            json_conf = Common.parseConfig(fs.readFileSync(file), file);
        } catch (e) {
            Common.printError(e);
            return cb ? cb(e) : this.exitCli(cst.ERROR_EXIT);
        }

        if (!env) {
            deployHelper();
            return cb ? cb() : this.exitCli(cst.SUCCESS_EXIT);
        }

        if (!json_conf.deploy || !json_conf.deploy[env]) {
            Common.printError("%s environment is not defined in %s file", env, file);
            return cb ? cb("%s environment is not defined in %s file") : this.exitCli(cst.ERROR_EXIT);
        }

        if (!json_conf.deploy[env]["post-deploy"]) {
            json_conf.deploy[env]["post-deploy"] = "pm2t startOrRestart " + file + " --env " + env;
        }

        pm2Deploy.deployForEnv(json_conf.deploy, env, args, (err, data) => {
            if (err) {
                Common.printError("Deploy failed");
                Common.printError(err.message || err);
                return cb ? cb(err) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut("--> Success");
            return cb ? cb(null, data) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
     * From Deploy - End
     */
    
    
    /**
     * From Module - Start
     */

    /**
     * Install / Update a module
     */
    install = function (module_name, opts?, cb?) {
        if (typeof (opts) == "function") {
            cb = opts;
            opts = {};
        }

        Modularizer.install(this, module_name, opts, (err, data) => {
            if (err) {
                Common.printError(cst.PREFIX_MSG_ERR + (err.message || err));
                return cb ? cb(Common.retErr(err)) : this.speedList(cst.ERROR_EXIT);
            }
            return cb ? cb(null, data) : this.speedList(cst.SUCCESS_EXIT);
        });
    };

    /**
     * Uninstall a module
     */
    uninstall = function (module_name, cb?) {
        Modularizer.uninstall(this, module_name, (err, data) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.speedList(cst.ERROR_EXIT);
            }
            return cb ? cb(null, data) : this.speedList(cst.SUCCESS_EXIT);
        });
    };

    launchAll = function (CLI, cb) {
        Modularizer.launchModules(CLI, cb);
    };

    package = function (module_path, cb?) {
        Modularizer.package(this, module_path, (err, res) => {
            if (err) {
                Common.errMod(err);
                return cb ? cb(err) : this.exitCli(1);
            }
            Common.logMod(`Module packaged in ${res.path}`);
            return cb ? cb(err) : this.exitCli(0);
        });
    };

    /**
     * Publish module on NPM + Git push
     */
    publish = function (folder, opts, cb?) {
        Modularizer.publish(this, folder, opts, (err, data) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.speedList(cst.ERROR_EXIT);
            }
            return cb ? cb(null, data) : this.speedList(cst.SUCCESS_EXIT);
        });
    };

    /**
     * Publish module on NPM + Git push
     */
    generateModuleSample = function (app_name, cb?) {
        Modularizer.generateSample(app_name, (err, data) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            return cb ? cb(null, data) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
     * Special delete method
     */
    deleteModule = function (module_name, cb) {
        const found_proc = [];

        this.Client.getAllProcess((err, procs) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb(Common.retErr(err));
            }

            procs.forEach(function (proc) {
                if (proc.pm2_env.name == module_name && proc.pm2_env.pmx_module) {
                    found_proc.push(proc.pm_id);
                }
            });

            if (found_proc.length == 0) {
                return cb();
            }

            this._operate("deleteProcessId", found_proc[0], function (err) {
                if (err) {
                    return cb(Common.retErr(err));
                }
                Common.printOut("In memory process deleted");
                return cb();
            });
        });
    };

    /**
     * From Module - End
     */


    /**
     * From Configuration - Start
     */ 

    get = function (key?, cb?) {
        if (!key || key == "all") {
            displayConf((err, data) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
            return false;
        }
        Configuration.get(key, (err, data) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            // pm2 conf module-name
            if (key.indexOf(":") === -1 && key.indexOf(".") === -1) {
                displayConf(key, () => {
                    console.log("Modules configuration. Copy/Paste line to edit values.");
                    return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
                });
                return false;
            }
            // pm2 conf module-name:key
            let module_name, key_name;

            if (key.indexOf(":") > -1) {
                module_name = key.split(":")[0];
                key_name = key.split(":")[1];
            } else if (key.indexOf(".") > -1) {
                module_name = key.split(".")[0];
                key_name = key.split(".")[1];
            }

            Common.printOut("Value for module " + chalk.blue(module_name), "key " + chalk.blue(key_name) + ": " + chalk.bold.green(data));


            return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    set = function (key, value, cb?) {
        if (!key) {
            interactiveConfigEdit((err) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
            return false;
        }

        /**
         * Set value
         */
        Configuration.set(key, value, (err) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }

            let values = [];

            if (key.indexOf(".") > -1) {
                values = key.split(".");
            }

            if (key.indexOf(":") > -1) {
                values = key.split(":");
            }

            if (values && values.length > 1) {
                // The first element is the app name (module_conf.json)
                const app_name = values[0];

                process.env.PM2_PROGRAMMATIC = "true";
                this.restart(app_name, {
                    updateEnv: true
                }, (err, data) => {
                    process.env.PM2_PROGRAMMATIC = "false";
                    if (!err) {
                        Common.printOut(cst.PREFIX_MSG + "Module %s restarted", app_name);
                    }
                    Common.log("Setting changed");
                    displayConf(app_name, function () {
                        return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
                    });
                });
                return false;
            }
            displayConf(null, () => {
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
        });
    };

    multiset = function (serial, cb?) {
        Configuration.multiset(serial, (err, data) => {
            if (err) {
                return cb ? cb({ success: false, err: err }) : this.exitCli(cst.ERROR_EXIT);
            }

            let values = [];
            const key = serial.match(/(?:[^ "]+|"[^"]*")+/g)[0];

            if (key.indexOf(".") > -1) {
                values = key.split(".");
            }

            if (key.indexOf(":") > -1) {
                values = key.split(":");
            }

            let app_name;
            if (values && values.length > 1) {
                // The first element is the app name (module_conf.json)
                app_name = values[0];

                process.env.PM2_PROGRAMMATIC = "true";
                this.restart(app_name, {
                    updateEnv: true
                }, (err, data) => {
                    process.env.PM2_PROGRAMMATIC = "false";
                    if (!err) {
                        Common.printOut(cst.PREFIX_MSG + "Module %s restarted", app_name);
                    }
                    displayConf(app_name, function () {
                        return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
                    });
                });
                return false;
            }
            displayConf(app_name, () => {
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
        });
    };

    unset = function (key, cb?) {
        Configuration.unset(key, (err) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }

            displayConf(() => {
                cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT); 
            });
        });
    };

    conf = function (key, value, cb?) {
        if (typeof (value) === "function") {
            cb = value;
            value = null;
        }

        // If key + value = set
        if (key && value) {
            this.set(key, value, (err) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
        } else if (key) {
        // If only key = get

            this.get(key, (err, data) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
        } else {
            interactiveConfigEdit((err) => {
                if (err) {
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
            });
        }
    };

    /**
     * From Configuration - End
     */
    
    
    /**
     * From Version - Start
     */

    _pull = function (opts, cb?) {
        const process_name = opts.process_name;
        const reload_type = opts.action;

        printOut(cst.PREFIX_MSG + "Updating repository for process name %s", process_name);

        this.Client.getProcessByNameOrId(process_name, (err, processes) => {

            if (err || processes.length === 0) {
                printError("No processes with this name or id : %s", process_name);
                return cb ? cb({ msg: "Process not found: " + process_name }) : this.exitCli(cst.ERROR_EXIT);
            }

            const proc = processes[0];
            if (!proc.pm2_env.versioning) {
                printOut(cst.PREFIX_MSG + "No versioning system found for process %s", process_name);
                return cb ? cb({ success: false, msg: "No versioning system found for process" }) : this.exitCli(cst.SUCCESS_EXIT);
            }
            require("vizion").update({
                folder: proc.pm2_env.versioning.repo_path
            }, (err, meta) => {
                if (err !== null) {
                    return cb ? cb({ msg: err }) : this.exitCli(cst.ERROR_EXIT);
                }

                if (meta.success === true) {
                    getPostUpdateCmds(proc.pm2_env.versioning.repo_path, process_name, (command_list) => {
                        execCommands(proc.pm2_env.versioning.repo_path, command_list, (err, res) => {
                            if (err !== null) {
                                printError(err);
                                return cb ? cb({ msg: meta.output + err }) : this.exitCli(cst.ERROR_EXIT);
                            } else {
                                printOut(cst.PREFIX_MSG + "Process successfully updated %s", process_name);
                                printOut(cst.PREFIX_MSG + "Current commit %s", meta.current_revision);
                                return this[reload_type](process_name, (err, procs) => {
                                    if (err && cb) {
                                        return cb(err);
                                    }
                                    if (err) {
                                        console.error(err);
                                    }
                                    return cb ? cb(null, meta.output + res) : this.exitCli(cst.SUCCESS_EXIT);
                                });
                            }
                        });
                    });
                } else {
                    printOut(cst.PREFIX_MSG + "Already up-to-date or an error occured for app: %s", process_name);
                    return cb ? cb({ success: false, msg: "Already up to date" }) : this.exitCli(cst.SUCCESS_EXIT);
                }
                return false;
            });
            return false;
        });
    };

    /**
     * CLI method for updating a repository to a specific commit id
     * @method pullCommitId
     * @param {string} process_name
     * @param {string} commit_id
     * @return
     */
    pullCommitId = function (process_name, commit_id, cb?) {
        const reload_type = "reload";
        printOut(cst.PREFIX_MSG + "Updating repository for process name %s", process_name);

        this.Client.getProcessByNameOrId(process_name, (err, processes) => {

            if (err || processes.length === 0) {
                printError("No processes with this name or id : %s", process_name);
                return cb ? cb({ msg: "Process not found: " + process_name }) : this.exitCli(cst.ERROR_EXIT);
            }

            const proc = processes[0];
            if (proc.pm2_env.versioning) {
                require("vizion").isUpToDate({ folder: proc.pm2_env.versioning.repo_path }, (err, meta) => {
                    if (err !== null) {
                        return cb ? cb({ msg: err }) : this.exitCli(cst.ERROR_EXIT);
                    }
                    require("vizion").revertTo(
                        {
                            revision: commit_id,
                            folder: proc.pm2_env.versioning.repo_path
                        },
                        (err2, meta2) => {
                            if (!err2 && meta2.success) {
                                getPostUpdateCmds(proc.pm2_env.versioning.repo_path, process_name, (command_list) => {
                                    execCommands(proc.pm2_env.versioning.repo_path, command_list, (err, res) => {
                                        if (err !== null) {
                                            printError(err);
                                            return cb ? cb({ msg: err }) : this.exitCli(cst.ERROR_EXIT);
                                        } else {
                                            printOut(cst.PREFIX_MSG + "Process successfully updated %s", process_name);
                                            printOut(cst.PREFIX_MSG + "Current commit %s", commit_id);
                                            return this[reload_type](process_name, cb);
                                        }
                                    });
                                });
                            } else {
                                printOut(cst.PREFIX_MSG + "Already up-to-date or an error occured: %s", process_name);
                                return cb ? cb(null, { success: meta.success }) : this.exitCli(cst.SUCCESS_EXIT);
                            }
                        });
                });
            } else {
                printOut(cst.PREFIX_MSG + "No versioning system found for process %s", process_name);
                return cb ? cb(null, { success: false }) : this.exitCli(cst.SUCCESS_EXIT);
            }
        });
    };

    /**
     * CLI method for downgrading a repository to the previous commit (older)
     * @method backward
     * @param {string} process_name
     * @return
     */
    backward = function (process_name, cb?) {
        printOut(cst.PREFIX_MSG + "Downgrading to previous commit repository for process name %s", process_name);

        this.Client.getProcessByNameOrId(process_name, (err, processes) => {

            if (err || processes.length === 0) {
                printError("No processes with this name or id : %s", process_name);
                return cb ? cb({ msg: "Process not found: " + process_name }) : this.exitCli(cst.ERROR_EXIT);
            }

            const proc = processes[0];
            // in case user searched by id/pid
            process_name = proc.name;

            if (proc.pm2_env.versioning === undefined ||
                proc.pm2_env.versioning === null) {
                return cb({ msg: "Versioning unknown" });
            }

            require("vizion").prev({
                folder: proc.pm2_env.versioning.repo_path
            }, (err, meta) => {
                if (err) {
                    return cb ? cb({ msg: err, data: meta }) : this.exitCli(cst.ERROR_EXIT);
                }

                if (meta.success !== true) {
                    printOut(cst.PREFIX_MSG + "No versioning system found for process %s", process_name);
                    return cb ? cb({ msg: err, data: meta }) : this.exitCli(cst.ERROR_EXIT);
                }

                getPostUpdateCmds(proc.pm2_env.versioning.repo_path, process_name, (command_list) => {
                    execCommands(proc.pm2_env.versioning.repo_path, command_list, (err, res) => {
                        if (err !== null) {
                            require("vizion").next({ folder: proc.pm2_env.versioning.repo_path }, (err2, meta2) => {
                                printError(err);
                                return cb ? cb({ msg: meta.output + err }) : this.exitCli(cst.ERROR_EXIT);
                            });
                            return false;
                        }

                        printOut(cst.PREFIX_MSG + "Process successfully updated %s", process_name);
                        printOut(cst.PREFIX_MSG + "Current commit %s", meta.current_revision);
                        this.reload(process_name, (err, procs) => {
                            if (err) {
                                return cb(err);
                            }
                            return cb ? cb(null, meta.output + res) : this.exitCli(cst.SUCCESS_EXIT);
                        });
                    });
                });
            });
        });
    };

    /**
     * CLI method for updating a repository to the next commit (more recent)
     * @method forward
     * @param {string} process_name
     * @return
     */
    forward = function (process_name, cb?) {
        printOut(cst.PREFIX_MSG + "Updating to next commit repository for process name %s", process_name);

        this.Client.getProcessByNameOrId(process_name, (err, processes) => {

            if (err || processes.length === 0) {
                printError("No processes with this name or id: %s", process_name);
                return cb ? cb({ msg: "Process not found: " + process_name }) : this.exitCli(cst.ERROR_EXIT);
            }

            const proc = processes[0];
            // in case user searched by id/pid
            process_name = proc.name;
            if (proc.pm2_env.versioning) {
                require("vizion").next({ folder: proc.pm2_env.versioning.repo_path }, (err, meta) => {
                    if (err !== null) {
                        return cb ? cb({ msg: err }) : this.exitCli(cst.ERROR_EXIT);
                    }
                    if (meta.success === true) {
                        getPostUpdateCmds(proc.pm2_env.versioning.repo_path, process_name, (command_list) => {
                            execCommands(proc.pm2_env.versioning.repo_path, command_list, (err, res) => {
                                if (err !== null) {
                                    require("vizion").prev({ folder: proc.pm2_env.versioning.repo_path }, (err2, meta2) => {
                                        printError(err);
                                        return cb ? cb({ msg: meta.output + err }) : this.exitCli(cst.ERROR_EXIT);
                                    });
                                } else {
                                    printOut(cst.PREFIX_MSG + "Process successfully updated %s", process_name);
                                    printOut(cst.PREFIX_MSG + "Current commit %s", meta.current_revision);
                                    this.reload(process_name, (err, procs) => {
                                        if (err) {
                                            return cb(err);
                                        }
                                        return cb ? cb(null, meta.output + res) : this.exitCli(cst.SUCCESS_EXIT);
                                    });
                                }
                            });
                        });
                    } else {
                        printOut(cst.PREFIX_MSG + "Already up-to-date or an error occured: %s", process_name);
                        return cb ? cb(null, { success: meta.success }) : this.exitCli(cst.SUCCESS_EXIT);
                    }
                });
            } else {
                printOut(cst.PREFIX_MSG + "No versioning system found for process %s", process_name);
                return cb ? cb({ success: false, msg: "No versioning system found" }) : this.exitCli(cst.SUCCESS_EXIT);
            }
        });
    };

    /**
     * CLI method for updating a repository
     * @method pullAndRestart
     * @param {string} process_name name of processes to pull
     * @return
     */
    pullAndRestart = function (process_name, cb?) {
        this._pull({ process_name: process_name, action: "reload" }, cb);
    };

    /**
     * CLI method for updating a repository
     * @method pullAndReload
     * @param {string} process_name name of processes to pull
     * @return
     */
    pullAndReload = function (process_name, cb?) {
        this._pull({ process_name: process_name, action: "reload" }, cb);
    };

    /**
     * CLI method for updating a repository to a specific commit id
     * @method pullCommitId
     * @param {object} opts
     * @return
     */
    _pullCommitId = function (opts, cb?) {
        this.pullCommitId(opts.pm2_name, opts.commit_id, cb);
    }; 
    
    /**
     * From Version - End
     */

    /**
     * From Startup - Start 
     */ 

    uninstallStartup = function (platform, opts, cb?) {
        let commands;
        const actual_platform = detectInitSystem();
        const user = opts.user || process.env.USER || process.env.LOGNAME; // Use LOGNAME on Solaris-like systems
        let service_name = (opts.serviceName || "pm2-" + user);
        const openrc_service_name = "pm2";
        const launchd_service_name = (opts.serviceName || "pm2." + user);
    
        if (!platform) {
            platform = actual_platform;
        } else if (actual_platform && actual_platform !== platform) {
            Common.printOut("-----------------------------------------------------------");
            Common.printOut(" PM2 detected " + actual_platform + " but you precised " + platform);
            Common.printOut(" Please verify that your choice is indeed your init system");
            Common.printOut(" If you arent sure, just run : pm2 startup");
            Common.printOut("-----------------------------------------------------------");
        }
        if (platform === null) {
            throw new Error("Init system not found");
        }
    
        if (!cb) {
            cb = (err, data) => {
                if (err) {
                    return this.exitCli(cst.ERROR_EXIT);
                }
                return this.exitCli(cst.SUCCESS_EXIT);
            };
        }
    
        if (process.getuid() != 0) {
            return isNotRoot("unsetup", platform, opts, cb);
        }
    
        if (fs.existsSync("/etc/init.d/pm2-init.sh")) {
            platform = "oldsystem";
        }
    
        let destination;
        switch (platform) {
            case "systemd":
                commands = [
                    "systemctl stop " + service_name,
                    "systemctl disable " + service_name,
                    "rm /etc/systemd/system/" + service_name + ".service"
                ];
                break;
            case "systemv":
                commands = [
                    "chkconfig " + service_name + " off",
                    "rm /etc/init.d/" + service_name
                ];
                break;
            case "oldsystem":
                Common.printOut(cst.PREFIX_MSG + "Disabling and deleting old startup system");
                commands = [
                    "update-rc.d pm2-init.sh disable",
                    "update-rc.d -f pm2-init.sh remove",
                    "rm /etc/init.d/pm2-init.sh"
                ];
                break;
            case "openrc":
                service_name = openrc_service_name;
                commands = [
                    "/etc/init.d/" + service_name + " stop",
                    "rc-update delete " + service_name + " default",
                    "rm /etc/init.d/" + service_name
                ];
                break;
            case "upstart":
                commands = [
                    "update-rc.d " + service_name + " disable",
                    "update-rc.d -f " + service_name + " remove",
                    "rm /etc/init.d/" + service_name
                ];
                break;
            case "launchd":
                destination = path.join(process.env.HOME, "Library/LaunchAgents/" + launchd_service_name + ".plist");
                commands = [
                    "launchctl remove " + launchd_service_name + " || true",
                    "rm " + destination
                ];
                break;
            case "rcd":
                service_name = (opts.serviceName || "pm2_" + user);
                commands = [
                    "/usr/local/etc/rc.d/" + service_name + " stop",
                    "sysrc -x " + service_name + "_enable",
                    "rm /usr/local/etc/rc.d/" + service_name
                ];
                break;
            case "rcd-openbsd":
                service_name = (opts.serviceName || "pm2_" + user);
                destination = path.join("/etc/rc.d", service_name);
                commands = [
                    "rcctl stop " + service_name,
                    "rcctl disable " + service_name,
                    "rm " + destination
                ];
                break;
            case "smf":
                service_name = (opts.serviceName || "pm2_" + user);
                commands = [
                    "svcadm disable " + service_name,
                    "svccfg delete -f " + service_name
                ];
        }
    
        sexec(commands.join("&& "), function (code, stdout, stderr) {
            Common.printOut(stdout);
            Common.printOut(stderr);
            if (code == 0) {
                Common.printOut(cst.PREFIX_MSG + chalk.bold("Init file disabled."));
            } else {
                Common.printOut(cst.ERROR_MSG + chalk.bold("Return code : " + code));
            }
    
            cb(null, {
                commands: commands,
                platform: platform
            });
        });
    };
    
    /**
       * Startup script generation
       * @method startup
       * @param {string} platform type (centos|redhat|amazon|gentoo|systemd|smf)
       */
    startup = function (platform, opts, cb?) {
        const actual_platform = detectInitSystem();
        const user = (opts.user || process.env.USER || process.env.LOGNAME); // Use LOGNAME on Solaris-like systems
        let service_name = (opts.serviceName || "pm2-" + user);
        const openrc_service_name = "pm2";
        const launchd_service_name = (opts.serviceName || "pm2." + user);
    
        if (!platform) {
            platform = actual_platform;
        } else if (actual_platform && actual_platform !== platform) {
            Common.printOut("-----------------------------------------------------------");
            Common.printOut(" PM2 detected " + actual_platform + " but you precised " + platform);
            Common.printOut(" Please verify that your choice is indeed your init system");
            Common.printOut(" If you arent sure, just run : pm2 startup");
            Common.printOut("-----------------------------------------------------------");
        }
        if (platform == null) {
            throw new Error("Init system not found");
        }
    
        if (!cb) {
            cb = (err, data) => {
                if (err) {
                    return this.exitCli(cst.ERROR_EXIT);
                }
                return this.exitCli(cst.SUCCESS_EXIT);
            };
        }
    
        if (process.getuid() != 0) {
            return isNotRoot("setup", platform, opts, cb);
        }
    
        let destination;
        let commands;
        let template;
    
        function getTemplate(type) {
            return fs.readFileSync(path.join(__dirname, "..", "templates/init-scripts", type + ".tpl"), { encoding: "utf8" });
        }
    
        switch (platform) {
            case "ubuntu":
            case "centos":
            case "arch":
            case "oracle":
            case "systemd":
                if (opts.waitIp) {
                    template = getTemplate("systemd-online");
                } else {
                    template = getTemplate("systemd");
                }
                destination = "/etc/systemd/system/" + service_name + ".service";
                commands = [
                    "systemctl enable " + service_name
                ];
                break;
            case "ubuntu14":
            case "ubuntu12":
            case "upstart":
                template = getTemplate("upstart");
                destination = "/etc/init.d/" + service_name;
                commands = [
                    "chmod +x " + destination,
                    "mkdir -p /var/lock/subsys",
                    "touch /var/lock/subsys/" + service_name,
                    "update-rc.d " + service_name + " defaults"
                ];
                break;
            case "systemv":
            case "amazon":
            case "centos6":
                template = getTemplate("upstart");
                destination = "/etc/init.d/" + service_name;
                commands = [
                    "chmod +x " + destination,
                    "mkdir -p /var/lock/subsys",
                    "touch /var/lock/subsys/" + service_name,
                    "chkconfig --add " + service_name,
                    "chkconfig " + service_name + " on",
                    "initctl list"
                ];
                break;
            case "macos":
            case "darwin":
            case "launchd":
                template = getTemplate("launchd");
                destination = path.join(process.env.HOME, "Library/LaunchAgents/" + launchd_service_name + ".plist");
                commands = [
                    "launchctl load -w " + destination
                ];
                break;
            case "freebsd":
            case "rcd":
                template = getTemplate("rcd");
                service_name = (opts.serviceName || "pm2_" + user);
                destination = "/usr/local/etc/rc.d/" + service_name;
                commands = [
                    "chmod 755 " + destination,
                    "sysrc " + service_name + "_enable=YES"
                ];
                break;
            case "openbsd":
            case "rcd-openbsd":
                template = getTemplate("rcd-openbsd");
                service_name = (opts.serviceName || "pm2_" + user);
                destination = path.join("/etc/rc.d/", service_name);
                commands = [
                    "chmod 755 " + destination,
                    "rcctl enable " + service_name,
                    "rcctl start " + service_name
                ];
                break;
            case "openrc":
                template = getTemplate("openrc");
                service_name = openrc_service_name;
                destination = "/etc/init.d/" + service_name;
                commands = [
                    "chmod +x " + destination,
                    "rc-update add " + service_name + " default"
                ];
                break;
            case "smf":
            case "sunos":
            case "solaris":
                template = getTemplate("smf");
                service_name = (opts.serviceName || "pm2_" + user);
                destination = path.join(tmpPath(), service_name + ".xml");
                commands = [
                    "svccfg import " + destination,
                    "svcadm enable " + service_name
                ];
                break;
            default:
                throw new Error("Unknown platform / init system name");
        }
    
        /**
         * 4# Replace template variable value
         */
        let envPath;
    
        if (cst.HAS_NODE_EMBEDDED == true) {
            envPath = util.format("%s:%s", process.env.PATH || "", path.dirname(process.execPath));
        } else if (new RegExp(path.dirname(process.execPath)).test(process.env.PATH)) {
            envPath = process.env.PATH;
        } else {
            envPath = util.format("%s:%s", process.env.PATH || "", path.dirname(process.execPath));
        }
    
        template = template.replace(/%PM2_PATH%/g, process.mainModule.filename)
            .replace(/%NODE_PATH%/g, envPath)
            .replace(/%USER%/g, user)
            .replace(/%HOME_PATH%/g, opts.hp ? path.resolve(opts.hp, ".pm2") : cst.PM2_ROOT_PATH)
            .replace(/%SERVICE_NAME%/g, service_name);
    
        Common.printOut(chalk.bold("Platform"), platform);
        Common.printOut(chalk.bold("Template"));
        Common.printOut(template);
        Common.printOut(chalk.bold("Target path"));
        Common.printOut(destination);
        Common.printOut(chalk.bold("Command list"));
        Common.printOut(commands);
    
        Common.printOut(cst.PREFIX_MSG + "Writing init configuration in " + destination);
        try {
            fs.writeFileSync(destination, template);
        } catch (e) {
            console.error(cst.PREFIX_MSG_ERR + "Failure when trying to write startup script");
            console.error(e.message || e);
            return cb(e);
        }
    
        Common.printOut(cst.PREFIX_MSG + "Making script booting at startup...");
    
        forEachLimit(commands, 1, function (command, next) {
            Common.printOut(cst.PREFIX_MSG + "[-] Executing: %s...", chalk.bold(command));
    
            sexec(command, function (code, stdout, stderr) {
                if (code === 0) {
                    Common.printOut(cst.PREFIX_MSG + chalk.bold("[v] Command successfully executed."));
                    return next();
                } else {
                    Common.printOut(chalk.red("[ERROR] Exit code : " + code));
                    return next(new Error(command + " failed, see error above."));
                }
            });
    
        }, function (err) {
            if (err) {
                console.error(cst.PREFIX_MSG_ERR + (err.message || err));
                return cb(err);
            }
            Common.printOut(chalk.bold.blue("+---------------------------------------+"));
            Common.printOut(chalk.bold.blue((cst.PREFIX_MSG + "Freeze a process list on reboot via:")));
            Common.printOut(chalk.bold("$ pm2 save"));
            Common.printOut("");
            Common.printOut(chalk.bold.blue(cst.PREFIX_MSG + "Remove init script via:"));
            Common.printOut(chalk.bold("$ pm2 unstartup " + platform));
    
            return cb(null, {
                destination: destination,
                template: template
            });
        });
    };
    
    /**
       * DISABLED FEATURE
       * KEEPING METHOD FOR BACKWARD COMPAT
       */
    autodump = function (cb?) {
        return cb();
    };
    
    /**
       * Dump current processes managed by pm2 into DUMP_FILE_PATH file
       * @method dump
       * @param {} cb
       * @return
       */
    dump = function (force, cb?) {
        const env_arr = [];
    
        if (typeof (force) === "function") {
            cb = force;
            force = false;
        }
    
        if (!cb) {
            Common.printOut(cst.PREFIX_MSG + "Saving current process list...");
        }
    
        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError("Error retrieving process list: " + err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
    
            /**
           * Description
           * @method fin
           * @param {} err
           * @return
           */
            const fin = (err) => {
    
                // try to fix issues with empty dump file
                // like #3485
                if (!force && env_arr.length === 0 && !process.env.FORCE) {
    
                    // fix : if no dump file, no process, only module and after pm2 update
                    if (!fs.existsSync(cst.DUMP_FILE_PATH)) {
                        this.clearDump(() => { });
                    }
    
                    // if no process in list don't modify dump file
                    // process list should not be empty
                    if (cb) {
                        return cb(new Error("Process list empty, cannot save empty list"));
                    } else {
                        Common.printOut(cst.PREFIX_MSG_WARNING + "PM2 is not managing any process, skipping save...");
                        Common.printOut(cst.PREFIX_MSG_WARNING + "To force saving use: pm2 save --force");
                        this.exitCli(cst.SUCCESS_EXIT);
                        return;
                    }
                }
    
                // Back up dump file
                try {
                    if (fs.existsSync(cst.DUMP_FILE_PATH)) {
                        fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
                    }
                } catch (e) {
                    console.error(e.stack || e);
                    Common.printOut(cst.PREFIX_MSG_ERR + "Failed to back up dump file in %s", cst.DUMP_BACKUP_FILE_PATH);
                }
    
                // Overwrite dump file, delete if broken and exit
                try {
                    fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(env_arr, [""], 2));
                } catch (e) {
                    console.error(e.stack || e);
                    try {
                        // try to backup file
                        if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
                            fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
                        }
                    } catch (e) {
                        // don't keep broken file
                        fs.unlinkSync(cst.DUMP_FILE_PATH);
                        console.error(e.stack || e);
                    }
                    Common.printOut(cst.PREFIX_MSG_ERR + "Failed to save dump file in %s", cst.DUMP_FILE_PATH);
                    return this.exitCli(cst.ERROR_EXIT);
                }
                if (cb) {
                    return cb(null, { success: true });
                }
    
                Common.printOut(cst.PREFIX_MSG + "Successfully saved in %s", cst.DUMP_FILE_PATH);
                return this.exitCli(cst.SUCCESS_EXIT);
            };
    
            (function ex(apps) {
                if (!apps[0]) {
                    return fin(null);
                }
                delete apps[0].pm2_env.instances;
                delete apps[0].pm2_env.pm_id;
                delete apps[0].pm2_env.prev_restart_delay;
                if (!apps[0].pm2_env.pmx_module) {
                    env_arr.push(apps[0].pm2_env);
                }
                apps.shift();
                return ex(apps);
            })(list);
        });
    };
    
    /**
       * Remove DUMP_FILE_PATH file and DUMP_BACKUP_FILE_PATH file
       * @method dump
       * @param {} cb
       * @return
       */
    clearDump = function (cb?) {
        fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify([]));
    
        if (cb && typeof cb === "function") {
            return cb();
        }
    
        Common.printOut(cst.PREFIX_MSG + "Successfully created %s", cst.DUMP_FILE_PATH);
        return this.exitCli(cst.SUCCESS_EXIT);
    };
    
    /**
       * Resurrect processes
       * @method resurrect
       * @param {} cb
       * @return
       */
    resurrect = function (cb?) {
        let apps = {};
    
        let processes;
    
        function readDumpFile(dumpFilePath) {
            Common.printOut(cst.PREFIX_MSG + "Restoring processes located in %s", dumpFilePath);
            let apps;
            try {
                apps = fs.readFileSync(dumpFilePath);
            } catch (e) {
                Common.printError(cst.PREFIX_MSG_ERR + "Failed to read dump file in %s", dumpFilePath);
                throw e;
            }
    
            return apps;
        }
    
        function parseDumpFile(dumpFilePath, apps) {
            let processes;
            try {
                processes = Common.parseConfig(apps, "none");
            } catch (e) {
                Common.printError(cst.PREFIX_MSG_ERR + "Failed to parse dump file in %s", dumpFilePath);
                try {
                    fs.unlinkSync(dumpFilePath);
                } catch (e) {
                    console.error(e.stack || e);
                }
                throw e;
            }
    
            return processes;
        }
    
        // Read dump file, fall back to backup, delete if broken
        try {
            apps = readDumpFile(cst.DUMP_FILE_PATH);
            processes = parseDumpFile(cst.DUMP_FILE_PATH, apps);
        } catch (e) {
            try {
                apps = readDumpFile(cst.DUMP_BACKUP_FILE_PATH);
                processes = parseDumpFile(cst.DUMP_BACKUP_FILE_PATH, apps);
            } catch (e) {
                Common.printError(cst.PREFIX_MSG_ERR + "No processes saved; DUMP file doesn't exist");
                // if (cb) return cb(Common.retErr(e));
                // else return that.exitCli(cst.ERROR_EXIT);
                return this.speedList();
            }
        }
    
        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(err);
                return this.exitCli(1);
            }
    
            const current = [];
            const target = [];
    
            list.forEach(function (app) {
                if (!current[app.name]) {
                    current[app.name] = 0;
                }
                current[app.name]++;
            });
    
            processes.forEach(function (app) {
                if (!target[app.name]) {
                    target[app.name] = 0;
                }
                target[app.name]++;
            });
    
            const tostart = Object.keys(target).filter(function (i) {
                return Object.keys(current).indexOf(i) < 0;
            });
    
            eachLimit(processes, cst.CONCURRENT_ACTIONS, (app, next) => {
                if (tostart.indexOf(app.name) == -1) {
                    return next();
                }
                this.Client.executeRemote("prepare", app, (err, dt) => {
                    if (err) {
                        Common.printError(err);
                    } else {
                        Common.printOut(cst.PREFIX_MSG + "Process %s restored", app.pm_exec_path);
                    }
                    next();
                });
            }, (err) => {
                return cb ? cb(null, apps) : this.speedList();
            });
        });
    };
    /**
       * From Startup - End 
       */ 

    /**
     * From Mgnt - Start
     */   

    /**
   * Description
   * @method flush
   * @return
   */
    flush = function (api, cb?) {
        if (!api) {
            Common.printOut(cst.PREFIX_MSG + "Flushing " + cst.PM2_LOG_FILE_PATH);
            fs.closeSync(fs.openSync(cst.PM2_LOG_FILE_PATH, "w"));
        }

        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            list.forEach((l) => {
                if (typeof api == "undefined") {
                    Common.printOut(cst.PREFIX_MSG + "Flushing:");
                    Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_out_log_path);
                    Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_err_log_path);

                    if (l.pm2_env.pm_log_path) {
                        Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_log_path);
                        fs.closeSync(fs.openSync(l.pm2_env.pm_log_path, "w"));
                    }
                    fs.closeSync(fs.openSync(l.pm2_env.pm_out_log_path, "w"));
                    fs.closeSync(fs.openSync(l.pm2_env.pm_err_log_path, "w"));
                } else if (l.pm2_env.name === api) {
                    Common.printOut(cst.PREFIX_MSG + "Flushing:");
                    Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_out_log_path);
                    Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_err_log_path);

                    if (l.pm2_env.pm_log_path &&
            l.pm2_env.pm_log_path.lastIndexOf("/") < l.pm2_env.pm_log_path.lastIndexOf(api)) {
                        Common.printOut(cst.PREFIX_MSG + l.pm2_env.pm_log_path);
                        fs.closeSync(fs.openSync(l.pm2_env.pm_log_path, "w"));
                    }

                    if (l.pm2_env.pm_out_log_path.lastIndexOf("/") < l.pm2_env.pm_out_log_path.lastIndexOf(api)) {
                        fs.closeSync(fs.openSync(l.pm2_env.pm_out_log_path, "w"));
                    }
                    if (l.pm2_env.pm_err_log_path.lastIndexOf("/") < l.pm2_env.pm_err_log_path.lastIndexOf(api)) {
                        fs.closeSync(fs.openSync(l.pm2_env.pm_err_log_path, "w"));
                    }
                }
            });

            Common.printOut(cst.PREFIX_MSG + "Logs flushed");
            return cb ? cb(null, list) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    logrotate = function (opts, cb?) {
        if (process.getuid() != 0) {
            return exec("whoami", (err, stdout, stderr) => {
                Common.printError(cst.PREFIX_MSG + "You have to run this command as root. Execute the following command:");
                Common.printError(cst.PREFIX_MSG + chalk.grey("      sudo env PATH=$PATH:" + path.dirname(process.execPath) + " pm2 logrotate -u " + stdout.trim()));

                cb ? cb(Common.retErr("You have to run this with elevated rights")) : this.exitCli(cst.ERROR_EXIT);
            });
        }

        if (!fs.existsSync("/etc/logrotate.d")) {
            Common.printError(cst.PREFIX_MSG + "/etc/logrotate.d does not exist we can not copy the default configuration.");
            return cb ? cb(Common.retErr("/etc/logrotate.d does not exist")) : this.exitCli(cst.ERROR_EXIT);
        }

        const templatePath = path.join(cst.TEMPLATE_FOLDER, cst.LOGROTATE_SCRIPT);
        Common.printOut(cst.PREFIX_MSG + "Getting logrorate template " + templatePath);
        let script = fs.readFileSync(templatePath, { encoding: "utf8" });

        const user = opts.user || "root";

        script = script.replace(/%HOME_PATH%/g, cst.PM2_ROOT_PATH)
            .replace(/%USER%/g, user);

        try {
            fs.writeFileSync("/etc/logrotate.d/pm2-" + user, script);
        } catch (e) {
            console.error(e.stack || e);
        }

        Common.printOut(cst.PREFIX_MSG + "Logrotate configuration added to /etc/logrotate.d/pm2");
        return cb ? cb(null, { success: true }) : this.exitCli(cst.SUCCESS_EXIT);
    };

    /**
   * Description
   * @method reloadLogs
   * @return
   */
    reloadLogs = function (cb?) {
        Common.printOut("Reloading all logs...");
        this.Client.executeRemote("reloadLogs", {}, (err, logs) => {
            if (err) {
                Common.printError(err);
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
            }
            Common.printOut("All logs reloaded");
            return cb ? cb(null, logs) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    /**
   * Description
   * @method streamLogs
   * @param {String} id
   * @param {Number} lines
   * @param {Boolean} raw
   * @return
   */
    streamLogs = (id, lines, raw, timestamp, exclusive, highlight?) => {
        const files_list = [];

        // If no argument is given, we stream logs for all running apps
        id = id || "all";
        lines = lines !== undefined ? lines : 20;
        lines = lines < 0 ? -(lines) : lines;

        // Avoid duplicates and check if path is different from '/dev/null'
        const pushIfUnique = (entry) => {
            let exists = false;

            if (entry.path.toLowerCase
        && entry.path.toLowerCase() !== "/dev/null") {

                files_list.some((file) => {
                    if (file.path === entry.path) {
                        exists = true;
                    }
                    return exists;
                });

                if (exists) {
                    return;
                }

                files_list.push(entry);
            }
        };

        // Get the list of all running apps
        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            const regexList = [];
            const namespaceList = [];

            if (err) {
                Common.printError(err);
                this.exitCli(cst.ERROR_EXIT);
            }

            if (lines === 0) {
                return Log.stream(this.Client, id, raw, timestamp, exclusive, highlight);
            }

            Common.printOut(chalk.bold.grey(util.format.call(this, "[TAILING] Tailing last %d lines for [%s] process%s (change the value with --lines option)", lines, id, id === "all" ? "es" : "")));

            // Populate the array `files_list` with the paths of all files we need to tail
            list.forEach((proc) => {
                if (proc.pm2_env && (id === "all" ||
          proc.pm2_env.name == id ||
          proc.pm2_env.pm_id == id)) {
                    if (proc.pm2_env.pm_out_log_path && exclusive !== "err") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_out_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "out"
                        });
                    }
                    if (proc.pm2_env.pm_err_log_path && exclusive !== "out") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_err_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "err"
                        });
                    }
                } else if (proc.pm2_env && proc.pm2_env.namespace == id) {
                    if (namespaceList.indexOf(proc.pm2_env.name) === -1) {
                        namespaceList.push(proc.pm2_env.name);
                    }
                    if (proc.pm2_env.pm_out_log_path && exclusive !== "err") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_out_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "out"
                        });
                    }
                    if (proc.pm2_env.pm_err_log_path && exclusive !== "out") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_err_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "err"
                        });
                    }
                } else if (proc.pm2_env && (isNaN(id) && id[0] === "/" && id[id.length - 1] === "/")) {
                // Populate the array `files_list` with the paths of all files we need to tail, when log in put is a regex

                    const regex = new RegExp(id.replace(/\//g, ""));
                    if (regex.test(proc.pm2_env.name)) {
                        if (regexList.indexOf(proc.pm2_env.name) === -1) {
                            regexList.push(proc.pm2_env.name);
                        }
                        if (proc.pm2_env.pm_out_log_path && exclusive !== "err") {
                            pushIfUnique({
                                path: proc.pm2_env.pm_out_log_path,
                                app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                                type: "out"
                            });
                        }
                        if (proc.pm2_env.pm_err_log_path && exclusive !== "out") {
                            pushIfUnique({
                                path: proc.pm2_env.pm_err_log_path,
                                app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                                type: "err"
                            });
                        }
                    }
                }
            });

            //for fixing issue https://github.com/Unitech/pm2/issues/3506
            /* if (files_list && files_list.length == 0) {
         Common.printError(cst.PREFIX_MSG_ERR + 'No file to stream for app [%s], exiting.', id);
         return process.exit(cst.ERROR_EXIT);
       }*/

            if (!raw && (id === "all" || id === "PM2") && exclusive === false) {
                Log.tail([{
                    path: cst.PM2_LOG_FILE_PATH,
                    app_name: "PM2",
                    type: "PM2"
                }], lines, raw, () => {
                    Log.tail(files_list, lines, raw, () => {
                        Log.stream(this.Client, id, raw, timestamp, exclusive, highlight);
                    });
                });
            } else {
                Log.tail(files_list, lines, raw, () => {
                    if (regexList.length > 0) {
                        regexList.forEach((id) => {
                            Log.stream(this.Client, id, raw, timestamp, exclusive, highlight);
                        });
                    } else if (namespaceList.length > 0) {
                        namespaceList.forEach((id) => {
                            Log.stream(this.Client, id, raw, timestamp, exclusive, highlight);
                        });
                    } else {
                        Log.stream(this.Client, id, raw, timestamp, exclusive, highlight);
                    }
                });
            }
        });
    };

    /**
   * Description
   * @method printLogs
   * @param {String} id
   * @param {Number} lines
   * @param {Boolean} raw
   * @return
   */
    printLogs = function (id, lines, raw, timestamp, exclusive) {
        const files_list = [];

        // If no argument is given, we stream logs for all running apps
        id = id || "all";
        lines = lines !== undefined ? lines : 20;
        lines = lines < 0 ? -(lines) : lines;

        // Avoid duplicates and check if path is different from '/dev/null'
        const pushIfUnique = function (entry) {
            let exists = false;

            if (entry.path.toLowerCase && entry.path.toLowerCase() !== "/dev/null") {

                files_list.some(function (file) {
                    if (file.path === entry.path) {
                        exists = true;
                    }
                    return exists;
                });

                if (exists) {
                    return;
                }

                files_list.push(entry);
            }
        };

        // Get the list of all running apps
        this.Client.executeRemote("getMonitorData", {}, (err, list) => {
            if (err) {
                Common.printError(err);
                this.exitCli(cst.ERROR_EXIT);
            }

            if (lines <= 0) {
                return this.exitCli(cst.SUCCESS_EXIT);
            }

            Common.printOut(chalk.bold.grey(util.format.call(this, "[TAILING] Tailing last %d lines for [%s] process%s (change the value with --lines option)", lines, id, id === "all" ? "es" : "")));

            // Populate the array `files_list` with the paths of all files we need to tail
            list.forEach(function (proc) {
                if (proc.pm2_env && (id === "all" ||
                    proc.pm2_env.name == id ||
                    proc.pm2_env.pm_id == id)) {
                    if (proc.pm2_env.pm_out_log_path && exclusive !== "err") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_out_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "out"
                        });
                    }
                    if (proc.pm2_env.pm_err_log_path && exclusive !== "out") {
                        pushIfUnique({
                            path: proc.pm2_env.pm_err_log_path,
                            app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                            type: "err"
                        });
                    }
                } else if (proc.pm2_env && (isNaN(id) && id[0] === "/" && id[id.length - 1] === "/")) {
                // Populate the array `files_list` with the paths of all files we need to tail, when log in put is a regex

                    const regex = new RegExp(id.replace(/\//g, ""));
                    if (regex.test(proc.pm2_env.name)) {
                        if (proc.pm2_env.pm_out_log_path && exclusive !== "err") {
                            pushIfUnique({
                                path: proc.pm2_env.pm_out_log_path,
                                app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                                type: "out"
                            });
                        }
                        if (proc.pm2_env.pm_err_log_path && exclusive !== "out") {
                            pushIfUnique({
                                path: proc.pm2_env.pm_err_log_path,
                                app_name: proc.pm2_env.pm_id + "|" + proc.pm2_env.name,
                                type: "err"
                            });
                        }
                    }
                }
            });

            if (!raw && (id === "all" || id === "PM2") && exclusive === false) {
                Log.tail([{
                    path: cst.PM2_LOG_FILE_PATH,
                    app_name: "PM2",
                    type: "PM2"
                }], lines, raw, function () {
                    Log.tail(files_list, lines, raw, function () {
                        this.exitCli(cst.SUCCESS_EXIT);
                    });
                });
            } else {
                Log.tail(files_list, lines, raw, function () {
                    this.exitCli(cst.SUCCESS_EXIT);
                });
            }
        });
    };
    /**
   * From Mgnt - End
   */ 

    /**
    * From Containerizer - Start
    */
    generateDockerfile = function (script, opts) {
        const docker_filepath = path.join(process.cwd(), "Dockerfile");

        fs.stat(docker_filepath, (err, stat) => {
            if (err || opts.force == true) {
                generateDockerfile(docker_filepath, script, {
                    mode: "development"
                })
                    .then(() => {
                        console.log(chalk.bold("New Dockerfile generated in current folder"));
                        console.log(chalk.bold("You can now run\n$ pm2 docker:dev <file|config>"));
                        return this.exitCli(cst.SUCCESS_EXIT);
                    });
                return false;
            }
            console.log(chalk.red.bold("Dockerfile already exists in this folder, use --force if you want to replace it"));
            this.exitCli(cst.ERROR_EXIT);
        });
    };

    dockerMode = function (script, opts, mode) {
        const promptly = require("promptly");
        handleExit(this, opts, mode);

        if (mode == "distribution" && !opts.imageName) {
            console.error(chalk.bold.red("--image-name [name] option is missing"));
            return this.exitCli(cst.ERROR_EXIT);
        }

        let template;
        let app_path, main_script;
        const node_version = opts.nodeVersion ? opts.nodeVersion.split(".")[0] : "latest";

        const image_name = opts.imageName || require("crypto").randomBytes(6).toString("hex");

        if (script.indexOf("/") > -1) {
            app_path = path.join(process.cwd(), path.dirname(script));
            main_script = path.basename(script);
        } else {
            app_path = process.cwd();
            main_script = script;
        }

        checkDockerSetup()
            .then(() => {
            /////////////////////////
            // Generate Dockerfile //
            /////////////////////////
                return new Promise((resolve, reject) => {
                    const docker_filepath = path.join(process.cwd(), "Dockerfile");

                    fs.stat(docker_filepath, (err, stat) => {
                        if (err) {
                        // Dockerfile does not exist, generate one
                        // console.log(chalk.blue.bold('Generating new Dockerfile'));
                            if (opts.force == true) {
                                return resolve(generateDockerfile(docker_filepath, main_script, {
                                    node_version: node_version,
                                    mode: mode
                                }));
                            }
                            if (opts.dockerdaemon) {
                                return resolve(generateDockerfile(docker_filepath, main_script, {
                                    node_version: node_version,
                                    mode: mode
                                }));
                            }
                            promptly.prompt("No Dockerfile in current directory, ok to generate a new one? (y/n)", (err, value) => {
                                if (value == "y") {
                                    return resolve(generateDockerfile(docker_filepath, main_script, {
                                        node_version: node_version,
                                        mode: mode
                                    }));
                                } else {
                                    return this.exitCli(cst.SUCCESS_EXIT);
                                }
                            });
                            return false;
                        }
                        return resolve(switchDockerFile(docker_filepath, main_script, {
                            node_version: node_version,
                            mode: mode
                        }));
                    });
                });
            })
            .then(function (_template) {
                template = _template;
                return Promise.resolve();
            })
            .then(function () {
            //////////////////
            // Docker build //
            //////////////////

                let docker_build = util.format("docker build -t %s -f %s",
                    image_name,
                    template.Dockerfile_path);

                if (opts.fresh == true) {
                    docker_build += " --no-cache";
                }
                docker_build += " .";

                console.log();
                fmt.sep();
                fmt.title("Building Boot System");
                fmt.field("Type", chalk.cyan.bold("Docker"));
                fmt.field("Mode", mode);
                fmt.field("Image name", image_name);
                fmt.field("Docker build command", docker_build);
                fmt.field("Dockerfile path", template.Dockerfile_path);
                fmt.sep();

                return pspawn(docker_build);
            })
            .then(() => {
            ////////////////
            // Docker run //
            ////////////////

                let docker_run = "docker run --net host";

                if (opts.dockerdaemon == true) {
                    docker_run += " -d";
                }
                if (mode != "distribution") {
                    docker_run += util.format(" -v %s:/var/app -v /var/app/node_modules", app_path);
                }
                docker_run += " " + image_name;
                const dockerfile_parsed = template.Dockerfile.split("\n");
                const base_image = dockerfile_parsed[0];
                const run_cmd = dockerfile_parsed[dockerfile_parsed.length - 1];

                console.log();
                fmt.sep();
                fmt.title("Booting");
                fmt.field("Type", chalk.cyan.bold("Docker"));
                fmt.field("Mode", mode);
                fmt.field("Base Image", base_image);
                fmt.field("Image Name", image_name);
                fmt.field("Docker Command", docker_run);
                fmt.field("RUN Command", run_cmd);
                fmt.field("CWD", app_path);
                fmt.sep();
                return pspawn(docker_run);
            })
            .then(() => {
                console.log(chalk.blue.bold(">>> Leaving Docker instance uuid=%s"), image_name);
                this.disconnect();
                return Promise.resolve();
            })
            .catch((err) => {
                console.log();
                console.log(chalk.grey("Raw error=", err.message));
                this.disconnect();
            });

    };
    /**
 * From Containerizer - End
 */

    /**
  * From pm2-plus link - Start
  */

    linkManagement = function (cmd, public_key, machine, opts, cb) {
        // pm2 link stop || kill
        if (cmd == "stop" || cmd == "kill") {
            this.gl_is_km_linked = false;
            console.log(cst.PM2_IO_MSG + " Stopping agent...");

            return this.killAgent((err) => {
                if (err) {
                    Common.printError(err);
                    return process.exit(cst.ERROR_EXIT);
                }
                console.log(cst.PM2_IO_MSG + " Stopped");

                this.reload("all", () => {
                    return process.exit(cst.SUCCESS_EXIT);
                });
            });
        }

        // pm2 link info
        if (cmd == "info") {
            console.log(cst.PM2_IO_MSG + " Getting agent information...");
            this.agentInfos((err, infos) => {
                if (err) {
                    console.error(cst.PM2_IO_MSG_ERR + " " + err.message);
                    return this.exitCli(cst.ERROR_EXIT);
                }
                console.log(infos);
                return this.exitCli(cst.SUCCESS_EXIT);
            });
            return false;
        }

        // pm2 link delete
        if (cmd == "delete") {
            this.gl_is_km_linked = false;
            console.log(cst.PM2_IO_MSG + " Permanently disable agent...");
            this.killAgent((err) => {
                try {
                    fs.unlinkSync(cst.INTERACTION_CONF);
                } catch (e) {
                    console.log(cst.PM2_IO_MSG + " No interaction config file found");
                    return process.exit(cst.SUCCESS_EXIT);
                }
                console.log(cst.PM2_IO_MSG + " Agent interaction ended");
                if (!cb) {
                    return process.exit(cst.SUCCESS_EXIT);
                }
                return cb();
            });
            return false;
        }

        if (cmd && !public_key) {
            console.error(cst.PM2_IO_MSG + " Command [%s] unknown or missing public key", cmd);
            return process.exit(cst.ERROR_EXIT);
        }

        // pm2 link xxx yyy
        let infos;

        if (!cmd) {
            infos = null;
        } else {
            infos = {
                public_key: public_key,
                secret_key: cmd,
                machine_name: machine,
                info_node: opts.infoNode || null,
                pm2_version: pkg.version
            };
        }

        if (opts && opts.axon === true && infos) {
            infos.agent_transport_axon = true;
            infos.agent_transport_websocket = false;
            process.env.AGENT_TRANSPORT_AXON = "true";
            process.env.AGENT_TRANSPORT_WEBSOCKET = "false";
        } else if (infos) {
            infos.agent_transport_axon = false;
            infos.agent_transport_websocket = true;
            process.env.AGENT_TRANSPORT_AXON = "false";
            process.env.AGENT_TRANSPORT_WEBSOCKET = "true";
        }

        this.link(infos, cb);
    };

    link = function (infos, cb) {
        if (infos && !infos.machine_name) {
            infos.machine_name = require("os").hostname() + "-" + require("crypto").randomBytes(2).toString("hex");
        }

        KMDaemon.launchAndInteract(cst, infos, (err, dt) => {
            if (err) {
                Common.printError(cst.PM2_IO_MSG + " Run `$ pm2 plus` to connect");
                return this.exitCli(cst.ERROR_EXIT);
            }
            console.log(chalk.bold.green("[+] PM2+ activated!"));
            if (!cb) {
                return this.exitCli(cst.SUCCESS_EXIT);
            }
            return cb(null, dt);
        });
    };

    agentInfos = function (cb) {
        KMDaemon.getInteractInfo(this._conf, function (err, data) {
            if (err) {
                return cb(Common.retErr(err));
            }
            return cb(null, data);
        });
    };

    killAgent = function (cb) {
        KMDaemon.killInteractorDaemon(this._conf, (err) => {
            if (err) {
                return cb ? cb(Common.retErr(err)) : this.exitCli(cst.SUCCESS_EXIT);
            }
            return cb ? cb(null) : this.exitCli(cst.SUCCESS_EXIT);
        });
    };

    unlink = function (cb?) {
        this.linkManagement("delete", cb);
    };
    /**
 * From pm2-plus link - End
 */

    /**
  * From pm2-plus process-selector - Start
  */
    /**
     * Monitor Selectively Processes (auto filter in interaction)
     * @param String state 'monitor' or 'unmonitor'
     * @param String target <pm_id|name|all>
     * @param Function cb callback
     */
    monitorState = function (state, target, cb?) {
        if (!target) {
            Common.printError(cst.PREFIX_MSG_ERR + "Please specify an <app_name|pm_id>");
            return cb ? cb(new Error("argument missing")) : this.exitCli(cst.ERROR_EXIT);
        }

        const monitor = (pm_id, cb) => {
            // State can be monitor or unmonitor
            this.Client.executeRemote(state, pm_id, cb);
        };

        if (target === "all") {
            this.Client.getAllProcessId((err, procs) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                forEachLimit(procs, 1, monitor, (err, res) => {
                    return typeof cb === "function" ? cb(err, res) : this.speedList();
                });
            });
        } else if (!Number.isInteger(parseInt(target))) {
            this.Client.getProcessIdByName(target, true, (err, procs) => {
                if (err) {
                    Common.printError(err);
                    return cb ? cb(Common.retErr(err)) : this.exitCli(cst.ERROR_EXIT);
                }
                forEachLimit(procs, 1, monitor, (err, res) => {
                    return typeof cb === "function" ? cb(err, res) : this.speedList();
                });
            });
        } else {
            monitor(parseInt(target), (err, res) => {
                return typeof cb === "function" ? cb(err, res) : this.speedList();
            });
        }
    };

    /**
     * From pm2-plus process-selector - End
     */

    /**
      * From pm2-plus helpers - Start 
      */

    openDashboard = function () {
        if (!this.gl_interact_infos) {
            Common.printError(chalk.bold.white("Agent if offline, type `$ pm2 plus` to log in"));
            return this.exitCli(cst.ERROR_EXIT);
        }

        const uri = `https://app.pm2.io/#/r/${this.gl_interact_infos.public_key}`;
        console.log(cst.PM2_IO_MSG + ` Opening ${uri}`);
        open(uri);
        setTimeout(_ => {
            this.exitCli();
        }, 200);
    };

    clearSetup = function (opts, cb) {
        const modules = ["event-loop-inspector"];
        this.gl_is_km_linked = false;

        if (semver.satisfies(process.version, "< 10.0.0")) {
            modules.push("v8-profiler-node8");
        }

        forEach(modules, (_module, next) => {
            this.uninstall(this, _module, () => {
                next();
            });
        }, (err) => {
            this.reload("all", () => {
                return cb();
            });
        });
    };

    /**
     * Install required package and enable flags for current running processes
     */
    minimumSetup = function (opts, cb) {
        this.gl_is_km_linked = true;

        const install = (cb) => {
            let modules = [];

            if (opts.type === "enterprise" || opts.type === "plus") {
                modules = ["pm2-logrotate", "pm2-server-monit"];
                if (semver.satisfies(process.version, "< 8.0.0")) {
                    modules.push("v8-profiler-node8");
                }
                if (opts.type === "enterprise") {
                    modules.push("deep-metrics");
                }
            }

            forEach(modules, (_module, next) => {
                this.install(this, _module, {}, () => {
                    next();
                });
            }, (err) => {
                this.reload("all", () => {
                    return cb();
                });
            });
        };

        this.processesAreAlreadyMonitored((already_monitored) => {
            if (already_monitored) {
                console.log(cst.PM2_IO_MSG + ` PM2 ${opts.type || ""} bundle already installed`);
                return cb();
            }

            if (opts.installAll) {
                return install(cb);
            }

            // promptly.confirm(chalk.bold('Install all pm2 plus dependencies ? (y/n)'), (err, answer) => {
            //   if (!err && answer === true)
            return install(cb);
            // self.reload('all', () => {
            //     return cb()
            //   })
            // });
        });
    };

    processesAreAlreadyMonitored = function(cb) {
        this.Client.executeRemote("getMonitorData", {}, function (err, list) {
            if (err) {
                return cb(false);
            }
            const l = list.filter(l => l.pm2_env.km_link == true);
            const l2 = list.filter(l => l.name == "pm2-server-monit");
    
            // return cb(l.length > 0 && l2.length > 0 ? true : false)
            cb(l.length > 0 && l2.length > 0 ? true : false);
        });
    };

    /**
     * From pm2-plus helpers - End 
     */
}

//////////////////////////
// Load all API methods //
//////////////////////////

export default API;

/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/******************************
 *    ______ _______ ______
 *   |   __ \   |   |__    |
 *   |    __/       |    __|
 *   |___|  |__|_|__|______|
 *
 *    Main Daemon side file
 *
 ******************************/

import cluster from "cluster";
import os from "os";
import path from "path";
import { EventEmitter2 } from "eventemitter2";
import fs from "fs";
import vizion from "vizion";
import debugLogger from "debug";
import Utility from "../Utility";
import cst from "../constants";
import timesLimit from "async/timesLimit";
import Configuration from "../Configuration";
import semver from "semver";

import eachLimit from "async/eachLimit";

/**
 * Populate God namespace
 */
import sysinfo from "../Sysinfo/SystemInfo";

import p from "path";
import treekill from "../TreeKill";

import dayjs from "dayjs";

import pkg from "../../package.json";

import chokidar from "chokidar";
import util from "util";

import pidusage from "pidusage";

import domain from "domain";
import { CronJob } from "cron";

import vCheck from "../VersionCheck";


const log = debugLogger("pm2:fork_mode");

const numCPUs = os.cpus() ? os.cpus().length : 1;
const debug = debugLogger("pm2:god");

/**
 * Override cluster module configuration
 */
if (semver.lt(process.version, "10.0.0")) {
    cluster.setupMaster({
        // TODO: please check this
        // windowsHide: true,
        exec: path.resolve(path.dirname(module.filename), "ProcessContainerLegacy.js")
    });
} else {
    cluster.setupMaster({
        // TODO: please check this
        // windowsHide: true,
        exec: path.resolve(path.dirname(module.filename), "ProcessContainer.js")
    });
}

/**
 * - Start
 */

/**
 * softReload will wait permission from process to exit
 * @method softReload
 * @param {} God
 * @param {} id
 * @param {} cb
 * @return Literal
 */
function softReload(godIns, id, cb) {
    const t_key = "_old_" + id;

    // Move old worker to tmp id
    godIns.clusters_db[t_key] = godIns.clusters_db[id];

    delete godIns.clusters_db[id];

    const old_worker = godIns.clusters_db[t_key];

    // Deep copy
    const new_env = Utility.clone(old_worker.pm2_env);

    // Reset created_at and unstable_restarts
    godIns.resetState(new_env);

    new_env.restart_time += 1;

    old_worker.pm2_env.pm_id = t_key;
    old_worker.pm_id = t_key;

    godIns.executeApp(new_env, function (err, new_worker) {
        if (err) {
            return cb(err);
        }

        let timer = null;

        const onListen = function () {
            clearTimeout(timer);
            softCleanDeleteProcess();
            console.log("-softReload- New worker listening");
        };

        // Bind to know when the new process is up
        new_worker.once("listening", onListen);

        timer = setTimeout(function () {
            new_worker.removeListener("listening", onListen);
            softCleanDeleteProcess();
        }, new_env.listen_timeout || cst.GRACEFUL_LISTEN_TIMEOUT);

        // Remove old worker properly
        const softCleanDeleteProcess = function () {
            const cleanUp = function () {
                clearTimeout(timer);
                console.log("-softReload- Old worker disconnected");
                return godIns.deleteProcessId(t_key, cb);
            };

            old_worker.once("disconnect", cleanUp);

            try {
                if (old_worker.state != "dead" && old_worker.state != "disconnected") {
                    old_worker.send && old_worker.send("shutdown");
                } else {
                    clearTimeout(timer);
                    console.error("Worker %d is already disconnected", old_worker.pm2_env.pm_id);
                    return godIns.deleteProcessId(t_key, cb);
                }
            } catch (e) {
                clearTimeout(timer);
                console.error("Worker %d is already disconnected", old_worker.pm2_env.pm_id);
                return godIns.deleteProcessId(t_key, cb);
            }

            timer = setTimeout(function () {
                old_worker.removeListener("disconnect", cleanUp);
                return godIns.deleteProcessId(t_key, cb);
            }, cst.GRACEFUL_TIMEOUT);
            return false;
        };
        return false;
    });
    return false;
}

/**
 * hardReload will reload without waiting permission from process
 * @method hardReload
 * @param {} God
 * @param {} id
 * @param {} cb
 * @return Literal
 */
function hardReload(godIns, id, wait_msg, cb) {
    const t_key = "_old_" + id;

    // Move old worker to tmp id
    godIns.clusters_db[t_key] = godIns.clusters_db[id];
    delete godIns.clusters_db[id];

    const old_worker = godIns.clusters_db[t_key];
    // Deep copy
    const new_env = Utility.clone(old_worker.pm2_env);
    new_env.restart_time += 1;

    // Reset created_at and unstable_restarts
    godIns.resetState(new_env);

    old_worker.pm2_env.pm_id = t_key;
    old_worker.pm_id = t_key;
    let timer = null;
    let readySignalSent = false;

    const onListen = function () {
        clearTimeout(timer);
        readySignalSent = true;
        console.log("-reload- New worker listening");
        return godIns.deleteProcessId(t_key, cb);
    };

    const listener = function (packet) {
        if (packet.raw === "ready" &&
            packet.process.name === old_worker.pm2_env.name &&
            packet.process.pm_id === id) {
            godIns.bus.removeListener("process:msg", listener);
            return onListen();
        }
    };

    if (wait_msg !== "listening") {
        godIns.bus.on("process:msg", listener);
    }

    godIns.executeApp(new_env, function (err, new_worker) {
        if (err) {
            return cb(err);
        }

        // Bind to know when the new process is up
        if (wait_msg === "listening") {
            new_worker.once("listening", onListen);
        }

        timer = setTimeout(function () {
            if (readySignalSent) {
                return;
            }

            if (wait_msg === "listening") {
                new_worker.removeListener(wait_msg, onListen);
            } else {
                godIns.bus.removeListener("process:msg", listener);
            }

            return godIns.deleteProcessId(t_key, cb);
        }, new_env.listen_timeout || cst.GRACEFUL_LISTEN_TIMEOUT);

        return false;
    });
    return false;
}
/**
 * From - End
 */

/**
 * From ActionMethods - Start
 */
function filterBadProcess(pro) {
    if (pro.pm2_env.status !== cst.ONLINE_STATUS) {
        return false;
    }

    if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
        if (isNaN(pro.pm2_env.axm_options.pid)) {
            return false;
        }
    }

    return true;
}

function getProcessId(pro) {
    let pid = pro.pid;

    if (pro.pm2_env.axm_options && pro.pm2_env.axm_options.pid) {
        pid = pro.pm2_env.axm_options.pid;
    }

    return pid;
}
/**
 * From ActionMethods - End
 */

/**
 * From Worker - Start
 */

const _getProcessById = function (pm_id) {
    const proc = God.clusters_db[pm_id];
    return proc ? proc : null;
};


const maxMemoryRestart = function (proc_key, cb) {
    const proc = _getProcessById(proc_key.pm2_env.pm_id);

    if (!(proc &&
        proc.pm2_env &&
        proc_key.monit)) {
        return cb();
    }

    if (proc_key.monit.memory !== undefined &&
        proc.pm2_env.max_memory_restart !== undefined &&
        proc.pm2_env.max_memory_restart < proc_key.monit.memory &&
        proc.pm2_env.axm_options &&
        proc.pm2_env.axm_options.pid === undefined) {
        console.log("[PM2][WORKER] Process %s restarted because it exceeds --max-memory-restart value (current_memory=%s max_memory_limit=%s [octets])", proc.pm2_env.pm_id, proc_key.monit.memory, proc.pm2_env.max_memory_restart);
        God.softReloadProcessId({
            id: proc.pm2_env.pm_id
        }, function (err, data) {
            if (err) {
                console.error(err.stack || err);
            }
            return cb();
        });
    } else {
        return cb();
    }
};

// Deprecated
const versioningRefresh = function (proc_key, cb) { // eslint-disable-line @typescript-eslint/no-unused-vars
    let proc = _getProcessById(proc_key.pm2_env.pm_id);
    if (!(proc &&
        proc.pm2_env &&
        (proc.pm2_env.vizion !== false && proc.pm2_env.vizion != "false") &&
        proc.pm2_env.versioning &&
        proc.pm2_env.versioning.repo_path)) {
        return cb();
    }

    if (proc.pm2_env.vizion_running === true) {
        debug("Vizion is already running for proc id: %d, skipping this round", proc.pm2_env.pm_id);
        return cb();
    }

    proc.pm2_env.vizion_running = true;
    const repo_path = proc.pm2_env.versioning.repo_path;

    vizion.analyze({
        folder: proc.pm2_env.versioning.repo_path
    },
    function (err, meta) {
        if (err != null) {
            return cb();
        }

        proc = _getProcessById(proc_key.pm2_env.pm_id);

        if (!(proc &&
                proc.pm2_env &&
                proc.pm2_env.versioning &&
                proc.pm2_env.versioning.repo_path)) {
            console.error("Proc not defined anymore or versioning unknown");
            return cb();
        }

        proc.pm2_env.vizion_running = false;
        meta.repo_path = repo_path;
        proc.pm2_env.versioning = meta;
        debug("[PM2][WORKER] %s parsed for versioning", proc.pm2_env.name);
        return cb();
    });
};

const tasks = function () {
    if (God.Worker.is_running === true) {
        debug("[PM2][WORKER] Worker is already running, skipping this round");
        return false;
    }
    God.Worker.is_running = true;

    God.getMonitorData(null, function (err, data) {
        if (err || !data || typeof (data) !== "object") {
            God.Worker.is_running = false;
            return console.error(err);
        }

        eachLimit(data, 1, function (proc, next) {
            if (!proc || !proc.pm2_env || proc.pm2_env.pm_id === undefined) {
                return next();
            }

            debug("[PM2][WORKER] Processing proc id:", proc.pm2_env.pm_id);

            // Reset restart delay if application has an uptime of more > 30secs
            if (proc.pm2_env.exp_backoff_restart_delay !== undefined &&
                proc.pm2_env.prev_restart_delay && proc.pm2_env.prev_restart_delay > 0) {
                const app_uptime = Date.now() - proc.pm2_env.pm_uptime;
                if (app_uptime > cst.EXP_BACKOFF_RESET_TIMER) {
                    const ref_proc = _getProcessById(proc.pm2_env.pm_id);
                    ref_proc.pm2_env.prev_restart_delay = 0;
                    console.log(`[PM2][WORKER] Reset the restart delay, as app ${proc.name} has been up for more than ${cst.EXP_BACKOFF_RESET_TIMER}ms`);
                }
            }

            // Check if application has reached memory threshold
            maxMemoryRestart(proc, function () {
                return next();
            });
        }, function (err) {
            God.Worker.is_running = false;
            debug("[PM2][WORKER] My job here is done, next job in %d seconds", parseInt((cst.WORKER_INTERVAL / 1000) + ""));
        });
    });
};

const wrappedTasks = function () {
    const d = domain.create();

    d.once("error", function (err) {
        console.error("[PM2][WORKER] Error caught by domain:\n" + (err.stack || err));
        God.Worker.is_running = false;
    });

    d.run(function () {
        tasks();
    });
};

/**
 * From Worker - End
 */

/**
 * Expose God
 */
let timer = null;

const God = {
    next_id: 0,
    clusters_db: {},
    configuration: {},
    started_at: Date.now(),
    system_infos_proc: null,
    system_infos: null,
    bus: new EventEmitter2({
        wildcard: true,
        delimiter: ":",
        maxListeners: 1000
    }),

    pm2_being_killed: false,


    CronJobs: new Map(),
    Worker: {
        is_running: false,

        start: function () {
            timer = setInterval(wrappedTasks, cst.WORKER_INTERVAL);

            setInterval(() => {
                vCheck({
                    state: "check",
                    version: pkg.version
                });
            }, 1000 * 60 * 60 * 24);
        },

        stop: function () {
            if (timer !== null) {
                clearInterval(timer);
            }
        },
    },

    /**
     * From Watcher - Start
     */

    /**
     * Watch folder for changes and restart
     * @method watch
     * @param {Object} pm2_env pm2 app environnement
     * @return MemberExpression
     */
    watch: {
        _watchers: {},

        enable: function (pm2_env) {
            if (God.watch._watchers[pm2_env.pm_id]) {
                God.watch._watchers[pm2_env.pm_id].close();
                God.watch._watchers[pm2_env.pm_id] = null;
                delete God.watch._watchers[pm2_env.pm_id];
            }

            log("Initial watch ", pm2_env.watch);

            let watch = pm2_env.watch;

            if (typeof watch == "boolean" || util.isArray(watch) && watch.length === 0) {
                watch = pm2_env.pm_cwd;
            }

            log("Watching %s", watch);

            let watch_options: any = {
                ignored: pm2_env.ignore_watch || /[\/\\]\.|node_modules/,
                persistent: true,
                ignoreInitial: true,
                cwd: pm2_env.pm_cwd
            };

            if (pm2_env.watch_options) {
                watch_options = Object.assign({}, watch_options, pm2_env.watch_options);
            }

            log("Watch opts", watch_options);

            const watcher = chokidar.watch(watch, watch_options);

            console.log("[Watch] Start watching", pm2_env.name);

            watcher.on("all", function (event, path) {
                if (this.restarting === true) {
                    log("Already restarting, skipping");
                    return false;
                }

                this.restarting = true;

                console.log("Change detected on path %s for app %s - restarting", path, pm2_env.name);

                setTimeout(function () {
                    God.restartProcessName(pm2_env.name, function (err, list) {
                        this.restarting = false;

                        if (err) {
                            log("Error while restarting", err);
                            return false;
                        }

                        return log("Process restarted");
                    });
                }, (pm2_env.watch_delay || 0));

                return false;
            });

            watcher.on("error", function (e) {
                console.error(e.stack || e);
            });

            God.watch._watchers[pm2_env.pm_id] = watcher;

            //return God.watch._watchers[pm2_env.name];
        },
        /**
             * Description
             * @method close
             * @param {} id
             * @return
             */
        disableAll: function () {
            let watchers = God.watch._watchers;

            console.log("[Watch] PM2 is being killed. Watch is disabled to avoid conflicts");
            for (const i in watchers) {
                watchers[i].close && watchers[i].close();
                // watchers.splice(i, 1);
            }
            // TODO: please check this
            watchers = {};
        },

        disable: function (pm2_env) {
            const watcher = God.watch._watchers[pm2_env.pm_id];
            if (watcher) {
                console.log("[Watch] Stop watching", pm2_env.name);
                watcher.close();
                delete God.watch._watchers[pm2_env.pm_id];
                return true;
            } else {
                return false;
            }
        },
    },

    /**
     * From Watcher - End
     */

    init: function () {
        God.system_infos_proc = null;

        this.configuration = Configuration.getSync("pm2");

        if (this.configuration && this.configuration.sysmonit == "true") {
            God.launchSysMonitoring({}, () => {
                console.log("System monitoring launched");
            });
        }

        setTimeout(function () {
            God.Worker.start();
        }, 500);
    },

    writeExitSeparator: function (pm2_env, code, signal) {
        try {
            let exit_sep = `[PM2][${new Date().toISOString()}] app exited`;
            if (code) {
                exit_sep += `itself with exit code: ${code}`;
            }
            if (signal) {
                exit_sep += `by an external signal: ${signal}`;
            }
            exit_sep += "\n";

            if (pm2_env.pm_out_log_path) {
                fs.writeFileSync(pm2_env.pm_out_log_path, exit_sep);
            }
            if (pm2_env.pm_err_log_path) {
                fs.writeFileSync(pm2_env.pm_err_log_path, exit_sep);
            }
            if (pm2_env.pm_log_path) {
                fs.writeFileSync(pm2_env.pm_log_path, exit_sep);
            }
        } catch (e) {
        }
    },

    /**
     * Init new process
     */
    prepare: function prepare(env, cb) {
        // generate a new unique id for each processes
        env.env.unique_id = Utility.generateUUID();

        // if the app is standalone, no multiple instance
        if (typeof env.instances === "undefined") {
            env.vizion_running = false;
            if (env.env && env.env.vizion_running) {
                env.env.vizion_running = false;
            }

            if (env.status == cst.STOPPED_STATUS) {
                env.pm_id = God.getNewId();
                const clu = {
                    pm2_env: env,
                    process: {
                    }
                };
                God.clusters_db[env.pm_id] = clu;
                return cb(null, [God.clusters_db[env.pm_id]]);
            }

            return God.executeApp(env, function (err, clu) {
                if (err) {
                    return cb(err);
                }
                God.notify("start", clu, true);
                return cb(null, [Utility.clone(clu)]);
            });
        }

        // find how many replicate the user want
        env.instances = parseInt(env.instances);
        if (env.instances === 0) {
            env.instances = numCPUs;
        } else if (env.instances < 0) {
            env.instances += numCPUs;
        }
        if (env.instances <= 0) {
            env.instances = 1;
        }

        timesLimit(env.instances, 1, function (n, next) {
            env.vizion_running = false;
            if (env.env && env.env.vizion_running) {
                env.env.vizion_running = false;
            }

            God.injectVariables(env, function inject(err, _env) {
                if (err) {
                    return next(err);
                }
                return God.executeApp(Utility.clone(_env), function (err, clu) {
                    if (err) {
                        return next(err);
                    }
                    God.notify("start", clu, true);
                    // here call next wihtout an array because
                    // async.times aggregate the result into an array
                    return next(null, Utility.clone(clu));
                });
            });
        }, cb);
    },

    /**
     * Launch the specified script (present in env)
     * @api private
     * @method executeApp
     * @param {Mixed} env
     * @param {Function} cb
     * @return Literal
     */
    executeApp: function executeApp(env, cb?) {
        const env_copy = Utility.clone(env);

        Utility.extend(env_copy, env_copy.env);

        env_copy["status"] = cst.LAUNCHING_STATUS;
        env_copy["pm_uptime"] = Date.now();
        env_copy["axm_actions"] = [];
        env_copy["axm_monitor"] = {};
        env_copy["axm_options"] = {};
        env_copy["axm_dynamic"] = {};
        env_copy["vizion_running"] =
            env_copy["vizion_running"] !== undefined ? env_copy["vizion_running"] : false;

        if (!env_copy.created_at) {
            env_copy["created_at"] = Date.now();
        }

        /**
         * Enter here when it's the first time that the process is created
         * 1 - Assign a new id
         * 2 - Reset restart time and unstable_restarts
         * 3 - Assign a log file name depending on the id
         * 4 - If watch option is set, look for changes
         */
        if (env_copy["pm_id"] === undefined) {
            env_copy["pm_id"] = God.getNewId();
            env_copy["restart_time"] = 0;
            env_copy["unstable_restarts"] = 0;

            // add -pm_id to pid file
            env_copy.pm_pid_path = env_copy.pm_pid_path.replace(/-[0-9]+\.pid$|\.pid$/g, "-" + env_copy["pm_id"] + ".pid");

            // If merge option, dont separate the logs
            if (!env_copy["merge_logs"]) {
                ["", "_out", "_err"].forEach(function (k) {
                    const key = "pm" + k + "_log_path";
                    env_copy[key] && (env_copy[key] = env_copy[key].replace(/-[0-9]+\.log$|\.log$/g, "-" + env_copy["pm_id"] + ".log"));
                });
            }

            // Initiate watch file
            if (env_copy["watch"]) {
                God.watch.enable(env_copy);
            }
        }

        God.registerCron(env_copy);

        /** Callback when application is launched */
        const readyCb = function ready(proc) {
            // If vizion enabled run versioning retrieval system
            if (proc.pm2_env.vizion !== false && proc.pm2_env.vizion !== "false") {
                God.finalizeProcedure(proc);
            } else {
                God.notify("online", proc);
            }

            if (proc.pm2_env.status !== cst.ERRORED_STATUS) {
                proc.pm2_env.status = cst.ONLINE_STATUS;
            }

            console.log(`App [${proc.pm2_env.name}:${proc.pm2_env.pm_id}] online`);
            if (cb) {
                cb(null, proc);
            }
        };

        if (env_copy.exec_mode === "cluster_mode") {
            /**
             * Cluster mode logic (for NodeJS apps)
             */
            God.nodeApp(env_copy, function nodeApp(err, clu) {
                if (cb && err) {
                    return cb(err);
                }
                if (err) {
                    return false;
                }

                let old_env = God.clusters_db[clu.pm2_env.pm_id];

                if (old_env) {
                    old_env = null;
                    God.clusters_db[clu.pm2_env.pm_id] = null;
                }

                God.clusters_db[clu.pm2_env.pm_id] = clu;

                clu.once("error", function (err) {
                    console.error(err.stack || err);
                    clu.pm2_env.status = cst.ERRORED_STATUS;
                    try {
                        clu.destroy && clu.destroy();
                    } catch (e: any) {
                        console.error(e.stack || e);
                        God.handleExit(clu, cst.ERROR_EXIT);
                    }
                });

                clu.once("disconnect", function () {
                    console.log("App name:%s id:%s disconnected", clu.pm2_env.name, clu.pm2_env.pm_id);
                });

                clu.once("exit", function cluExit(code, signal) {
                    //God.writeExitSeparator(clu.pm2_env, code, signal)
                    God.handleExit(clu, code || 0, signal || "SIGINT");
                });

                return clu.once("online", function () {
                    if (!clu.pm2_env.wait_ready) {
                        return readyCb(clu);
                    }

                    // Timeout if the ready message has not been sent before listen_timeout
                    const ready_timeout = setTimeout(function () {
                        God.bus.removeListener("process:msg", listener);
                        return readyCb(clu);
                    }, clu.pm2_env.listen_timeout || cst.GRACEFUL_LISTEN_TIMEOUT);

                    const listener = function (packet) {
                        if (packet.raw === "ready" &&
                            packet.process.name === clu.pm2_env.name &&
                            packet.process.pm_id === clu.pm2_env.pm_id) {
                            clearTimeout(ready_timeout);
                            God.bus.removeListener("process:msg", listener);
                            return readyCb(clu);
                        }
                    };

                    God.bus.on("process:msg", listener);
                });
            });
        } else {
            /**
             * Fork mode logic
             */
            God.forkMode(env_copy, function forkMode(err, clu) {
                if (cb && err) {
                    return cb(err);
                }
                if (err) {
                    return false;
                }

                let old_env = God.clusters_db[clu.pm2_env.pm_id];
                if (old_env) {
                    old_env = null;
                }

                God.clusters_db[env_copy.pm_id] = clu;

                clu.once("error", function cluError(err) {
                    console.error(err.stack || err);
                    clu.pm2_env.status = cst.ERRORED_STATUS;
                    try {
                        clu.kill && clu.kill();
                    } catch (e: any) {
                        console.error(e.stack || e);
                        God.handleExit(clu, cst.ERROR_EXIT);
                    }
                });

                clu.once("exit", function cluClose(code, signal) {
                    //God.writeExitSeparator(clu.pm2_env, code, signal)

                    if (clu.connected === true) {
                        clu.disconnect && clu.disconnect();
                    }
                    clu._reloadLogs = null;
                    return God.handleExit(clu, code || 0, signal);
                });

                if (!clu.pm2_env.wait_ready) {
                    return readyCb(clu);
                }

                // Timeout if the ready message has not been sent before listen_timeout
                const ready_timeout = setTimeout(function () {
                    God.bus.removeListener("process:msg", listener);
                    return readyCb(clu);
                }, clu.pm2_env.listen_timeout || cst.GRACEFUL_LISTEN_TIMEOUT);

                const listener = function (packet) {
                    if (packet.raw === "ready" &&
                        packet.process.name === clu.pm2_env.name &&
                        packet.process.pm_id === clu.pm2_env.pm_id) {
                        clearTimeout(ready_timeout);
                        God.bus.removeListener("process:msg", listener);
                        return readyCb(clu);
                    }
                };
                God.bus.on("process:msg", listener);
            });
        }
        return false;
    },

    /**
     * Handle logic when a process exit (Node or Fork)
     * @method handleExit
     * @param {} clu
     * @param {} exit_code
     * @return
     */
    handleExit: function handleExit(clu, exit_code, kill_signal?) {
        console.log(`App [${clu.pm2_env.name}:${clu.pm2_env.pm_id}] exited with code [${exit_code}] via signal [${kill_signal || "SIGINT"}]`);

        const proc = this.clusters_db[clu.pm2_env.pm_id];

        if (!proc) {
            console.error("Process undefined ? with process id ", clu.pm2_env.pm_id);
            return false;
        }

        const stopping = (proc.pm2_env.status == cst.STOPPING_STATUS
            || proc.pm2_env.status == cst.STOPPED_STATUS
            || proc.pm2_env.status == cst.ERRORED_STATUS)
            || (proc.pm2_env.autorestart === false || proc.pm2_env.autorestart === "false");

        let overlimit = false;

        if (stopping) {
            proc.process.pid = 0;
        }

        // Reset probes and actions
        if (proc.pm2_env.axm_actions) {
            proc.pm2_env.axm_actions = [];
        }
        if (proc.pm2_env.axm_monitor) {
            proc.pm2_env.axm_monitor = {};
        }

        if (proc.pm2_env.status != cst.ERRORED_STATUS &&
            proc.pm2_env.status != cst.STOPPING_STATUS) {
            proc.pm2_env.status = cst.STOPPED_STATUS;
        }

        if (proc.pm2_env.pm_id.toString().indexOf("_old_") !== 0) {
            try {
                fs.unlinkSync(proc.pm2_env.pm_pid_path);
            } catch (e) {
                debug("Error when unlinking pid file", e);
            }
        }

        /**
         * Avoid infinite reloop if an error is present
         */
        // If the process has been created less than 15seconds ago

        // And if the process has an uptime less than a second
        const min_uptime = typeof (proc.pm2_env.min_uptime) !== "undefined" ? proc.pm2_env.min_uptime : 1000;
        const max_restarts = typeof (proc.pm2_env.max_restarts) !== "undefined" ? proc.pm2_env.max_restarts : 16;

        if ((Date.now() - proc.pm2_env.created_at) < (min_uptime * max_restarts)) {
            if ((Date.now() - proc.pm2_env.pm_uptime) < min_uptime) {
                // Increment unstable restart
                proc.pm2_env.unstable_restarts += 1;
            }
        }


        if (proc.pm2_env.unstable_restarts >= max_restarts) {
            // Too many unstable restart in less than 15 seconds
            // Set the process as 'ERRORED'
            // And stop restarting it
            proc.pm2_env.status = cst.ERRORED_STATUS;
            proc.process.pid = 0;

            console.log("Script %s had too many unstable restarts (%d). Stopped. %j",
                proc.pm2_env.pm_exec_path,
                proc.pm2_env.unstable_restarts,
                proc.pm2_env.status);

            God.notify("restart overlimit", proc);

            proc.pm2_env.unstable_restarts = 0;
            proc.pm2_env.created_at = null;
            overlimit = true;
        }

        if (typeof (exit_code) !== "undefined") {
            proc.pm2_env.exit_code = exit_code;
        }

        God.notify("exit", proc);

        if (God.pm2_being_killed) {
            //console.log('[HandleExit] PM2 is being killed, stopping restart procedure...');
            return false;
        }

        let restart_delay = 0;

        if (proc.pm2_env.restart_delay !== undefined &&
            !isNaN(parseInt(proc.pm2_env.restart_delay))) {
            proc.pm2_env.status = cst.WAITING_RESTART;
            restart_delay = parseInt(proc.pm2_env.restart_delay);
        }

        if (proc.pm2_env.exp_backoff_restart_delay !== undefined &&
            !isNaN(parseInt(proc.pm2_env.exp_backoff_restart_delay))) {
            proc.pm2_env.status = cst.WAITING_RESTART;
            if (!proc.pm2_env.prev_restart_delay) {
                proc.pm2_env.prev_restart_delay = proc.pm2_env.exp_backoff_restart_delay;
                restart_delay = proc.pm2_env.exp_backoff_restart_delay;
            } else {
                proc.pm2_env.prev_restart_delay = Math.floor(Math.min(15000, proc.pm2_env.prev_restart_delay * 1.5));
                restart_delay = proc.pm2_env.prev_restart_delay;
            }
            console.log(`App [${clu.pm2_env.name}:${clu.pm2_env.pm_id}] will restart in ${restart_delay}ms`);
        }

        if (!stopping && !overlimit) {
            //make this property unenumerable
            Object.defineProperty(proc.pm2_env, "restart_task", { configurable: true, writable: true });
            proc.pm2_env.restart_task = setTimeout(function () {
                proc.pm2_env.restart_time += 1;
                God.executeApp(proc.pm2_env);
            }, restart_delay);
        }

        return false;
    },

    /**
     * @method finalizeProcedure
     * @param proc {Object}
     * @return
     */
    finalizeProcedure: function finalizeProcedure(proc) {
        let last_path = "";
        let current_path = proc.pm2_env.cwd || path.dirname(proc.pm2_env.pm_exec_path);
        const proc_id = proc.pm2_env.pm_id;

        proc.pm2_env.version = Utility.findPackageVersion(proc.pm2_env.pm_exec_path || proc.pm2_env.cwd);

        if (proc.pm2_env.vizion_running === true) {
            debug("Vizion is already running for proc id: %d, skipping this round", proc_id);
            return God.notify("online", proc);
        }
        proc.pm2_env.vizion_running = true;

        vizion.analyze({ folder: current_path }, function recur_path(err, meta) {
            const proc = God.clusters_db[proc_id];

            if (err) {
                debug(err.stack || err);
            }

            if (!proc ||
                !proc.pm2_env ||
                proc.pm2_env.status == cst.STOPPED_STATUS ||
                proc.pm2_env.status == cst.STOPPING_STATUS ||
                proc.pm2_env.status == cst.ERRORED_STATUS) {
                return console.error("Cancelling versioning data parsing");
            }

            proc.pm2_env.vizion_running = false;

            if (!err) {
                proc.pm2_env.versioning = meta;
                proc.pm2_env.versioning.repo_path = current_path;
                God.notify("online", proc);
            } else if (err && current_path === last_path) {
                proc.pm2_env.versioning = null;
                God.notify("online", proc);
            } else {
                last_path = current_path;
                current_path = path.dirname(current_path);
                proc.pm2_env.vizion_running = true;
                vizion.analyze({ folder: current_path }, recur_path);
            }
            return false;
        });
    },

    /**
     * Inject variables into processes
     * @param {Object} env environnement to be passed to the process
     * @param {Function} cb invoked with <err, env>
     */
    injectVariables: function injectVariables(env, cb) {
        // allow to override the key of NODE_APP_INSTANCE if wanted
        const instanceKey = process.env.PM2_PROCESS_INSTANCE_VAR || env.instance_var;

        // we need to find the last NODE_APP_INSTANCE used
        const instances = Object.keys(God.clusters_db)
            .map(function (procId) {
                return God.clusters_db[procId];
            }).filter(function (proc) {
                return proc.pm2_env.name === env.name &&
                    typeof proc.pm2_env[instanceKey] !== "undefined";
            }).map(function (proc) {
                return proc.pm2_env[instanceKey];
            }).sort(function (a, b) {
                return b - a;
            });
        // default to last one + 1
        let instanceNumber = typeof instances[0] === "undefined" ? 0 : instances[0] + 1;
        // but try to find a one available
        for (let i = 0; i < instances.length; i++) {
            if (instances.indexOf(i) === -1) {
                instanceNumber = i;
                break;
            }
        }
        env[instanceKey] = instanceNumber;

        // if using increment_var, we need to increment it
        if (env.increment_var) {
            const lastIncrement = Object.keys(God.clusters_db)
                .map(function (procId) {
                    return God.clusters_db[procId];
                }).filter(function (proc) {
                    return proc.pm2_env.name === env.name &&
                        typeof proc.pm2_env[env.increment_var] !== "undefined";
                }).map(function (proc) {
                    return proc.pm2_env[env.increment_var];
                }).sort(function (a, b) {
                    return b - a;
                })[0];
            // inject a incremental variable
            const defaut = env.env[env.increment_var] || 0;
            env[env.increment_var] = typeof lastIncrement === "undefined" ? defaut : lastIncrement + 1;
            env.env[env.increment_var] = env[env.increment_var];
        }

        return cb(null, env);
    },

    launchSysMonitoring: function (env, cb) {
        if (God.system_infos_proc !== null) {
            return cb(new Error("Sys Monitoring already launched"));
        }

        try {
            God.system_infos_proc = new sysinfo();

            setInterval(() => {
                God.system_infos_proc.query((err, data) => {
                    if (err) {
                        return;
                    }
                    God.system_infos = data;
                });
            }, 1000);

            God.system_infos_proc.fork();
        } catch (e) {
            console.log(e);
            God.system_infos_proc = null;
        }
        return cb();
    },


    /**
     * From Event - Start
     */
    notify: function (action_name, data, manually?) {
        God.bus.emit("process:event", {
            event: action_name,
            manually: typeof (manually) == "undefined" ? false : true,
            process: Utility.formatCLU(data),
            at: Utility.getDate()
        });
    },

    notifyByProcessId: function (opts, cb) {
        if (typeof (opts.id) === "undefined") {
            return cb(new Error("process id missing"));
        }
        const proc = God.clusters_db[opts.id];
        if (!proc) {
            return cb(new Error("process id doesnt exists"));
        }

        God.bus.emit("process:event", {
            event: opts.action_name,
            manually: typeof (opts.manually) == "undefined" ? false : true,
            process: Utility.formatCLU(proc),
            at: Utility.getDate()
        });

        process.nextTick(function () {
            return cb ? cb(null) : false;
        });
        return false;
    },
    /**
     * From Event - End
     */

    /**
     * From Methods - Start
     */

    /**
     * Description
     * @method logAndGenerateError
     * @param {} err
     * @return NewExpression
     */
    logAndGenerateError: function (err, opts?) {
        // Is an Error object
        if (err instanceof Error) {
            console.trace(err);
            return err;
        }
        // Is a JSON or simple string
        console.error(err);
        return new Error(err);
    },

    /**
     * Utility functions
     * @method getProcesses
     * @return MemberExpression
     */
    getProcesses: function () {
        return God.clusters_db;
    },

    getFormatedProcess: function getFormatedProcesses(id) {
        if (God.clusters_db[id]) {
            return {
                pid: God.clusters_db[id].process.pid,
                name: God.clusters_db[id].pm2_env.name,
                pm2_env: God.clusters_db[id].pm2_env,
                pm_id: God.clusters_db[id].pm2_env.pm_id
            };
        }
        return {};
    },

    /**
     * Get formated processes
     * @method getFormatedProcesses
     * @return {Array} formated processes
     */
    getFormatedProcesses: function getFormatedProcesses() {
        const keys = Object.keys(God.clusters_db);
        const arr = [];
        const kl = keys.length;

        for (let i = 0; i < kl; i++) {
            const key = keys[i];

            if (!God.clusters_db[key]) {
                continue;
            }
            // Avoid _old type pm_ids
            if (isNaN(God.clusters_db[key].pm2_env.pm_id)) {
                continue;
            }

            arr.push({
                pid: God.clusters_db[key].process.pid,
                name: God.clusters_db[key].pm2_env.name,
                pm2_env: God.clusters_db[key].pm2_env,
                pm_id: God.clusters_db[key].pm2_env.pm_id
            });
        }
        return arr;
    },

    /**
     * Description
     * @method findProcessById
     * @param {} id
     * @return ConditionalExpression
     */
    findProcessById: function findProcessById(id) {
        return God.clusters_db[id] ? God.clusters_db[id] : null;
    },

    /**
     * Description
     * @method findByName
     * @param {} name
     * @return arr
     */
    findByName: function (name) {
        const db = God.clusters_db;
        const arr = [];

        if (name == "all") {
            for (const key in db) {
                // Avoid _old_proc process style
                if (typeof (God.clusters_db[key].pm2_env.pm_id) === "number") {
                    arr.push(db[key]);
                }
            }
            return arr;
        }

        for (const key in db) {
            if (God.clusters_db[key].pm2_env.name == name ||
                God.clusters_db[key].pm2_env.pm_exec_path == p.resolve(name)) {
                arr.push(db[key]);
            }
        }
        return arr;
    },

    /**
     * Check if a process is alive in system processes
     * Return TRUE if process online
     * @method checkProcess
     * @param {} pid
     * @return
     */
    checkProcess: function (pid) {
        if (!pid) {
            return false;
        }

        try {
            // Sending 0 signal do not kill the process
            process.kill(pid, 0);
            return true;
        } catch (err) {
            return false;
        }
    },

    /**
     * Description
     * @method processIsDead
     * @param {} pid
     * @param {} cb
     * @return Literal
     */
    processIsDead: function (pid, pm2_env, cb, sigkill?) {
        if (!pid) {
            return cb({ type: "param:missing", msg: "no pid passed" });
        }

        let timeout = null;
        const kill_timeout = (pm2_env && pm2_env.kill_timeout) ? pm2_env.kill_timeout : cst.KILL_TIMEOUT;
        // const mode = pm2_env.exec_mode;

        const timer = setInterval(function () {
            if (God.checkProcess(pid) === false) {
                console.log("pid=%d msg=process killed", pid);
                clearTimeout(timeout);
                clearInterval(timer);
                return cb(null, true);
            }
            console.log("pid=%d msg=failed to kill - retrying in %dms", pid, pm2_env.kill_retry_time);
            return false;
        }, pm2_env.kill_retry_time);

        timeout = setTimeout(function () {
            clearInterval(timer);
            if (sigkill) {
                console.log("Process with pid %d could not be killed", pid);
                return cb({ type: "timeout", msg: "timeout" });
            } else {
                console.log("Process with pid %d still alive after %sms, sending it SIGKILL now...", pid, kill_timeout);

                if (pm2_env.treekill !== true) {
                    try {
                        process.kill(parseInt(pid), "SIGKILL");
                    } catch (e: any) {
                        console.error("[SimpleKill][SIGKILL] %s pid can not be killed", pid, e.stack, e.message);
                    }
                    return God.processIsDead(pid, pm2_env, cb, true);
                } else {
                    treekill(parseInt(pid), "SIGKILL", function (err) {
                        return God.processIsDead(pid, pm2_env, cb, true);
                    });
                }
            }
        }, kill_timeout);
        return false;
    },

    /**
     * Description
     * @method killProcess
     * @param int pid
     * @param Object pm2_env
     * @param function cb
     * @return CallExpression
     */
    killProcess: function (pid, pm2_env, cb) {
        if (!pid) {
            return cb({ msg: "no pid passed or null" });
        }

        if (typeof (pm2_env.pm_id) === "number" &&
            (cst.KILL_USE_MESSAGE || pm2_env.shutdown_with_message == true)) {
            const proc = God.clusters_db[pm2_env.pm_id];

            if (proc && proc.send) {
                try {
                    proc.send("shutdown");
                } catch (e: any) {
                    console.error(`[AppKill] Cannot send "shutdown" message to ${pid}`);
                    console.error(e.stack, e.message);
                }
                return God.processIsDead(pid, pm2_env, cb);
            } else {
                console.log(`[AppKill] ${pid} pid cannot be notified with send()`);
            }
        }

        if (pm2_env.treekill !== true) {
            try {
                process.kill(parseInt(pid), cst.KILL_SIGNAL);
            } catch (e: any) {
                console.error("[SimpleKill] %s pid can not be killed", pid, e.stack, e.message);
            }
            return God.processIsDead(pid, pm2_env, cb);
        } else {
            treekill(parseInt(pid), cst.KILL_SIGNAL, function (err) {
                return God.processIsDead(pid, pm2_env, cb);
            });
        }
    },

    /**
     * Description
     * @method getNewId
     * @return UpdateExpression
     */
    getNewId: function () {
        return God.next_id++;
    },

    /**
     * When a process is restarted or reloaded reset fields
     * to monitor unstable starts
     * @method resetState
     * @param {} pm2_env
     * @return
     */
    resetState: function (pm2_env) {
        pm2_env.created_at = Date.now();
        pm2_env.unstable_restarts = 0;
        pm2_env.prev_restart_delay = 0;
    },
    /**
     * From Methods - End
     */

    /**
     * From ForkMode - Start
     */

    /**
     * For all apps - FORK MODE
     * fork the app
     * @method forkMode
     * @param {} pm2_env
     * @param {} cb
     * @return
     */
    forkMode: function forkMode(pm2_env, cb) {
        let command = "";
        let args = [];

        console.log(`App [${pm2_env.name}:${pm2_env.pm_id}] starting in -fork mode-`);
        const spawn = require("child_process").spawn;

        const interpreter = pm2_env.exec_interpreter || "node";
        const pidFile = pm2_env.pm_pid_path;

        if (interpreter !== "none") {
            command = interpreter;

            if (pm2_env.node_args && Array.isArray(pm2_env.node_args)) {
                args = args.concat(pm2_env.node_args);
            }

            // Deprecated - to remove at some point
            if (process.env.PM2_NODE_OPTIONS) {
                args = args.concat(process.env.PM2_NODE_OPTIONS.split(" "));
            }

            if (interpreter === "node" || RegExp("node$").test(interpreter)) {
                if (semver.lt(process.version, "10.0.0")) {
                    args.push(path.resolve(path.dirname(module.filename), "..", "ProcessContainerForkLegacy.js"));
                } else {
                    args.push(path.resolve(path.dirname(module.filename), "..", "ProcessContainerFork.js"));
                }
            } else {
                args.push(pm2_env.pm_exec_path);
            }
        } else {
            command = pm2_env.pm_exec_path;
            args = [];
        }

        if (pm2_env.args) {
            args = args.concat(pm2_env.args);
        }

        // piping stream o file
        const stds: any = {
            out: pm2_env.pm_out_log_path,
            err: pm2_env.pm_err_log_path
        };

        // entire log std if necessary.
        if ("pm_log_path" in pm2_env) {
            stds.std = pm2_env.pm_log_path;
        }

        log("stds: %j", stds);

        Utility.startLogging(stds, function (err, result) {
            if (err) {
                God.logAndGenerateError(err);
                return cb(err);
            }

            let cspr;
            try {
                const options: any = {
                    env: pm2_env,
                    detached: true,
                    cwd: pm2_env.pm_cwd || process.cwd(),
                    stdio: ["pipe", "pipe", "pipe", "ipc"] //Same as fork() in node core
                };

                if (typeof (pm2_env.windowsHide) === "boolean") {
                    options.windowsHide = pm2_env.windowsHide;
                } else {
                    options.windowsHide = true;
                }

                if (pm2_env.uid) {
                    options.uid = pm2_env.uid;
                }

                if (pm2_env.gid) {
                    options.gid = pm2_env.gid;
                }

                cspr = spawn(command, args, options);
            } catch (e) {
                God.logAndGenerateError(e);
                return cb(e);
            }

            if (!cspr || !cspr.stderr || !cspr.stdout) {
                const fatalError = new Error("Process could not be forked properly, check your system health");
                God.logAndGenerateError(fatalError);
                return cb(fatalError);
            }

            cspr.process = {};
            cspr.process.pid = cspr.pid;
            cspr.pm2_env = pm2_env;

            function transformLogToJson(pm2_env, type, data) {
                return JSON.stringify({
                    message: data.toString(),
                    timestamp: pm2_env.log_date_format ? dayjs().format(pm2_env.log_date_format) : new Date().toISOString(),
                    type: type,
                    process_id: cspr.pm2_env.pm_id,
                    app_name: cspr.pm2_env.name
                }) + "\n";
            }

            function prefixLogWithDate(pm2_env, data) {
                let log_data: any[] = [];
                log_data = data.toString().split("\n");
                if (log_data.length > 1) {
                    log_data.pop();
                }
                log_data = log_data.map(line => `${dayjs().format(pm2_env.log_date_format)}: ${line}\n`);
                return log_data.join("");
            }

            cspr.stderr.on("data", function forkErrData(data) {
                let log_data = null;

                // via --out /dev/null --err /dev/null
                if (pm2_env.disable_logs === true) {
                    return false;
                }

                if (pm2_env.log_type && pm2_env.log_type === "json") {
                    log_data = transformLogToJson(pm2_env, "err", data);
                } else if (pm2_env.log_date_format) {
                    log_data = prefixLogWithDate(pm2_env, data);
                } else {
                    log_data = data.toString();
                }

                God.bus.emit("log:err", {
                    process: {
                        pm_id: cspr.pm2_env.pm_id,
                        name: cspr.pm2_env.name,
                        rev: (cspr.pm2_env.versioning && cspr.pm2_env.versioning.revision) ? cspr.pm2_env.versioning.revision : null,
                        namespace: cspr.pm2_env.namespace
                    },
                    at: Utility.getDate(),
                    data: log_data
                });

                if (Utility.checkPathIsNull(pm2_env.pm_err_log_path) &&
                    (!pm2_env.pm_log_path || Utility.checkPathIsNull(pm2_env.pm_log_path))) {
                    return false;
                }

                stds.std && stds.std.write && stds.std.write(log_data);
                stds.err && stds.err.write && stds.err.write(log_data);
            });

            cspr.stdout.on("data", function forkOutData(data) {
                let log_data = null;

                if (pm2_env.disable_logs === true) {
                    return false;
                }

                if (pm2_env.log_type && pm2_env.log_type === "json") {
                    log_data = transformLogToJson(pm2_env, "out", data);
                } else if (pm2_env.log_date_format) {
                    log_data = prefixLogWithDate(pm2_env, data);
                } else {
                    log_data = data.toString();
                }

                God.bus.emit("log:out", {
                    process: {
                        pm_id: cspr.pm2_env.pm_id,
                        name: cspr.pm2_env.name,
                        rev: (cspr.pm2_env.versioning && cspr.pm2_env.versioning.revision) ? cspr.pm2_env.versioning.revision : null,
                        namespace: cspr.pm2_env.namespace
                    },
                    at: Utility.getDate(),
                    data: log_data
                });

                if (Utility.checkPathIsNull(pm2_env.pm_out_log_path) &&
                    (!pm2_env.pm_log_path || Utility.checkPathIsNull(pm2_env.pm_log_path))) {
                    return false;
                }

                stds.std && stds.std.write && stds.std.write(log_data);
                stds.out && stds.out.write && stds.out.write(log_data);
            });

            /**
             * Broadcast message to God
             */
            cspr.on("message", function forkMessage(msg) {
                /*********************************
                 * If you edit this function
                 * Do the same in ClusterMode.js !
                 *********************************/
                if (msg.data && msg.type) {
                    process.nextTick(function () {
                        return God.bus.emit(msg.type ? msg.type : "process:msg", {
                            at: Utility.getDate(),
                            data: msg.data,
                            process: {
                                pm_id: cspr.pm2_env.pm_id,
                                name: cspr.pm2_env.name,
                                versioning: cspr.pm2_env.versioning,
                                namespace: cspr.pm2_env.namespace
                            }
                        });
                    });
                } else {

                    if (typeof msg == "object" && "node_version" in msg) {
                        cspr.pm2_env.node_version = msg.node_version;
                        return false;
                    } else if (typeof msg == "object" && "cron_restart" in msg) {
                        // cron onTick is invoked in the process
                        return God.restartProcessId({
                            id: cspr.pm2_env.pm_id
                        }, function () {
                            console.log("Application %s has been restarted via CRON", cspr.pm2_env.name);
                        });
                    }

                    return God.bus.emit("process:msg", {
                        at: Utility.getDate(),
                        raw: msg,
                        process: {
                            pm_id: cspr.pm2_env.pm_id,
                            name: cspr.pm2_env.name,
                            namespace: cspr.pm2_env.namespace
                        }
                    });
                }
            });

            try {
                const pid = cspr.pid;
                if (typeof (pid) !== "undefined") {
                    fs.writeFileSync(pidFile, pid.toString());
                }
            } catch (e: any) {
                console.error(e.stack || e);
            }

            cspr.once("exit", function forkClose(status) {
                try {
                    for (const k in stds) {
                        if (stds[k] && stds[k].destroy) {
                            stds[k].destroy();
                        } else if (stds[k] && stds[k].end) {
                            stds[k].end();
                        } else if (stds[k] && stds[k].close) {
                            stds[k].close();
                        }
                        stds[k] = stds[k]._file;
                    }
                } catch (e) {
                    God.logAndGenerateError(e);
                }
            });

            cspr._reloadLogs = function (cb) {
                try {
                    for (const k in stds) {
                        if (stds[k] && stds[k].destroy) {
                            stds[k].destroy();
                        } else if (stds[k] && stds[k].end) {
                            stds[k].end();
                        } else if (stds[k] && stds[k].close) {
                            stds[k].close();
                        }
                        stds[k] = stds[k]._file;
                    }
                } catch (e) {
                    God.logAndGenerateError(e);
                }
                //cspr.removeAllListeners();
                Utility.startLogging(stds, cb);
            };

            cspr.unref();

            return cb(null, cspr);
        });

    },

    /**
     * From ForkMode - End
     */


    /**
     * From ClusterMode - Start
     */

    /**
     * For Node apps - Cluster mode
     * It will wrap the code and enable load-balancing mode
     * @method nodeApp
     * @param {} env_copy
     * @param {} cb
     * @return Literal
     */
    nodeApp: function nodeApp(env_copy, cb) {
        let clu = null;

        console.log(`App [${env_copy.name}:${env_copy.pm_id}] starting in -cluster mode-`);
        if (env_copy.node_args && Array.isArray(env_copy.node_args)) {
            cluster.settings.execArgv = env_copy.node_args;
        }

        env_copy._pm2_version = pkg.version;

        try {
            // node.js cluster clients can not receive deep-level objects or arrays in the forked process, e.g.:
            // { "args": ["foo", "bar"], "env": { "foo1": "bar1" }} will be parsed to
            // { "args": "foo, bar", "env": "[object Object]"}
            // So we passing a stringified JSON here.
            clu = cluster.fork({ pm2_env: JSON.stringify(env_copy), windowsHide: true });
        } catch (e) {
            God.logAndGenerateError(e);
            return cb(e);
        }

        clu.pm2_env = env_copy;

        /**
         * Broadcast message to God
         */
        clu.on("message", function cluMessage(msg) {
            /*********************************
             * If you edit this function
             * Do the same in ForkMode.js !
             *********************************/
            if (msg.data && msg.type) {
                return God.bus.emit(msg.type ? msg.type : "process:msg", {
                    at: Utility.getDate(),
                    data: msg.data,
                    process: {
                        pm_id: clu.pm2_env.pm_id,
                        name: clu.pm2_env.name,
                        rev: (clu.pm2_env.versioning && clu.pm2_env.versioning.revision) ? clu.pm2_env.versioning.revision : null,
                        namespace: clu.pm2_env.namespace
                    }
                });
            } else {

                if (typeof msg == "object" && "node_version" in msg) {
                    clu.pm2_env.node_version = msg.node_version;
                    return false;
                } else if (typeof msg == "object" && "cron_restart" in msg) {
                    return God.restartProcessId({
                        id: clu.pm2_env.pm_id
                    }, function () {
                        console.log("Application %s has been restarted via CRON", clu.pm2_env.name);
                    });
                }

                return God.bus.emit("process:msg", {
                    at: Utility.getDate(),
                    raw: msg,
                    process: {
                        pm_id: clu.pm2_env.pm_id,
                        name: clu.pm2_env.name,
                        namespace: clu.pm2_env.namespace
                    }
                });
            }
        });

        return cb(null, clu);
    },

    /**
     * From ClusterMode - End
     */

    /**
     * From Reload - Start
     */

    /**
     * Reload
     * @method softReloadProcessId
     * @param {} id
     * @param {} cb
     * @return CallExpression
     */
    softReloadProcessId: function (opts, cb) {
        const id = opts.id;
        // const env = opts.env || {};

        if (!(id in God.clusters_db)) {
            return cb(new Error(`pm_id ${id} not available in ${id}`));
        }

        if (God.clusters_db[id].pm2_env.status == cst.ONLINE_STATUS &&
            God.clusters_db[id].pm2_env.exec_mode == "cluster_mode" &&
            !God.clusters_db[id].pm2_env.wait_ready) {

            Utility.extend(God.clusters_db[id].pm2_env.env, opts.env);
            Utility.extendExtraConfig(God.clusters_db[id], opts);

            return softReload(God, id, cb);
        } else {
            console.log("Process %s in a stopped status, starting it", id);
            return God.restartProcessId(opts, cb);
        }
    },

    /**
     * Reload
     * @method reloadProcessId
     * @param {} id
     * @param {} cb
     * @return CallExpression
     */
    reloadProcessId: function (opts, cb) {
        const id = opts.id;
        // const env = opts.env || {};

        if (!(id in God.clusters_db)) {
            return cb(new Error("PM2 ID unknown"));
        }

        if (God.clusters_db[id].pm2_env.status == cst.ONLINE_STATUS &&
            God.clusters_db[id].pm2_env.exec_mode == "cluster_mode") {

            Utility.extend(God.clusters_db[id].pm2_env.env, opts.env);
            Utility.extendExtraConfig(God.clusters_db[id], opts);

            const wait_msg = God.clusters_db[id].pm2_env.wait_ready ? "ready" : "listening";
            return hardReload(God, id, wait_msg, cb);
        } else {
            console.log("Process %s in a stopped status, starting it", id);
            return God.restartProcessId(opts, cb);
        }
    },
    /**
     * From Reload - End
     */

    /**
     * From ActionMethods - Start
     */

    /**
     * Description
     * @method getMonitorData
     * @param {} env
     * @param {} cb
     * @return
     */
    getMonitorData: function getMonitorData(env, cb) {
        let processes = God.getFormatedProcesses();
        const pids = processes.filter(filterBadProcess)
            .map(function (pro, i) {
                const pid = getProcessId(pro);
                return pid;
            });

        // No pids, return empty statistics
        if (pids.length === 0) {
            return cb(null, processes.map(function (pro) {
                pro["monit"] = {
                    memory: 0,
                    cpu: 0
                };

                return pro;
            }));
        }

        pidusage(pids, function retPidUsage(err, statistics) {
            // Just log, we'll set empty statistics
            if (err) {
                console.error("Error caught while calling pidusage");
                console.error(err);

                return cb(null, processes.map(function (pro) {
                    pro["monit"] = {
                        memory: 0,
                        cpu: 0
                    };
                    return pro;
                }));
            }

            if (!statistics) {
                console.error("Statistics is not defined!");

                return cb(null, processes.map(function (pro) {
                    pro["monit"] = {
                        memory: 0,
                        cpu: 0
                    };
                    return pro;
                }));
            }

            processes = processes.map(function (pro) {
                if (filterBadProcess(pro) === false) {
                    pro["monit"] = {
                        memory: 0,
                        cpu: 0
                    };

                    return pro;
                }

                const pid = getProcessId(pro);
                const stat = statistics[pid];

                if (!stat) {
                    pro["monit"] = {
                        memory: 0,
                        cpu: 0
                    };

                    return pro;
                }

                pro["monit"] = {
                    memory: stat.memory,
                    cpu: Math.round(stat.cpu * 10) / 10
                };

                return pro;
            });

            cb(null, processes);
        });
    },

    /**
     * Description
     * @method getSystemData
     * @param {} env
     * @param {} cb
     * @return
     */
    getSystemData: function getSystemData(env, cb) {
        if (God.system_infos_proc !== null) {
            God.system_infos_proc.query((err, data) => {
                cb(null, data);
            });
        } else {
            cb(new Error("Sysinfos not launched, type: pm2 sysmonit"));
        }
    },

    /**
     * Description
     * @method dumpProcessList
     * @param {} cb
     * @return
     */
    dumpProcessList: function (cb) {
        const process_list = [];
        const apps = Utility.clone(God.getFormatedProcesses());

        // Don't override the actual dump file if process list is empty
        // unless user explicitely did `pm2 dump`.
        // This often happens when PM2 crashed, we don't want to override
        // the dump file with an empty list of process.
        if (!apps[0]) {
            debug("[PM2] Did not override dump file because list of processes is empty");
            return cb(null, { success: true, process_list: process_list });
        }

        const fin = (err) => {

            // try to fix issues with empty dump file
            // like #3485
            if (process_list.length === 0) {

                // fix : if no dump file, no process, only module and after pm2 update
                if (!fs.existsSync(cst.DUMP_FILE_PATH) && typeof this.clearDump === "function") {
                    this.clearDump(function () {
                        // do nothing
                    });
                }

                // if no process in list don't modify dump file
                // process list should not be empty
                return cb(null, { success: true, process_list: process_list });
            }

            // Back up dump file
            try {
                if (fs.existsSync(cst.DUMP_FILE_PATH)) {
                    fs.writeFileSync(cst.DUMP_BACKUP_FILE_PATH, fs.readFileSync(cst.DUMP_FILE_PATH));
                }
            } catch (e: any) {
                console.error(e.stack || e);
            }

            // Overwrite dump file, delete if broken
            try {
                fs.writeFileSync(cst.DUMP_FILE_PATH, JSON.stringify(process_list));
            } catch (e: any) {
                console.error(e.stack || e);
                try {
                    // try to backup file
                    if (fs.existsSync(cst.DUMP_BACKUP_FILE_PATH)) {
                        fs.writeFileSync(cst.DUMP_FILE_PATH, fs.readFileSync(cst.DUMP_BACKUP_FILE_PATH));
                    }
                } catch (e: any) {
                    // don't keep broken file
                    fs.unlinkSync(cst.DUMP_FILE_PATH);
                    console.error(e.stack || e);
                }
            }

            return cb(null, { success: true, process_list: process_list });
        };

        function saveProc(apps) {
            if (!apps[0]) {
                return fin(null);
            }
            delete apps[0].pm2_env.instances;
            delete apps[0].pm2_env.pm_id;
            // Do not dump modules
            if (!apps[0].pm2_env.pmx_module) {
                process_list.push(apps[0].pm2_env);
            }
            apps.shift();
            return saveProc(apps);
        }
        saveProc(apps);
    },

    /**
     * Description
     * @method ping
     * @param {} env
     * @param {} cb
     * @return CallExpression
     */
    ping: function (env, cb) {
        return cb(null, { msg: "pong" });
    },

    /**
     * Description
     * @method notifyKillPM2
     */
    notifyKillPM2: function () {
        God.pm2_being_killed = true;
    },

    /**
     * Duplicate a process
     * @method duplicateProcessId
     * @param {} id
     * @param {} cb
     * @return CallExpression
     */
    duplicateProcessId: function (id, cb) {
        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError(id + " id unknown"), {});
        }

        if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
            return cb(God.logAndGenerateError("Error when getting proc || proc.pm2_env"), {});
        }

        const proc = Utility.clone(God.clusters_db[id].pm2_env);


        delete proc.created_at;
        delete proc.pm_id;
        delete proc.unique_id;

        // generate a new unique id for new process
        proc.unique_id = Utility.generateUUID();

        God.injectVariables(proc, function inject(_err, proc) {
            return God.executeApp(Utility.clone(proc), function (err, clu) {
                if (err) {
                    return cb(err);
                }
                God.notify("start", clu, true);
                return cb(err, Utility.clone(clu));
            });
        });
    },

    /**
     * Start a stopped process by ID
     * @method startProcessId
     * @param {} id
     * @param {} cb
     * @return CallExpression
     */
    startProcessId: function (id, cb) {
        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError(id + " id unknown"), {});
        }

        const proc = God.clusters_db[id];
        if (proc.pm2_env.status == cst.ONLINE_STATUS) {
            return cb(God.logAndGenerateError("process already online"), {});
        }
        if (proc.pm2_env.status == cst.LAUNCHING_STATUS) {
            return cb(God.logAndGenerateError("process already started"), {});
        }
        if (proc.process && proc.process.pid) {
            return cb(God.logAndGenerateError("Process with pid " + proc.process.pid + " already exists"), {});
        }

        return God.executeApp(God.clusters_db[id].pm2_env, function (err, proc) {
            return cb(err, Utility.clone(proc));
        });
    },


    /**
     * Stop a process and set it on state 'stopped'
     * @method stopProcessId
     * @param {} id
     * @param {} cb
     * @return Literal
     */
    stopProcessId: function (id, cb) {
        if (typeof id == "object" && "id" in id) {
            id = id.id;
        }

        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError(id + " : id unknown"), {});
        }

        const proc = God.clusters_db[id];

        //clear time-out restart task
        clearTimeout(proc.pm2_env.restart_task);

        if (proc.pm2_env.status == cst.STOPPED_STATUS) {
            proc.process.pid = 0;
            return cb(null, God.getFormatedProcess(id));
        }
        // state == 'none' means that the process is not online yet
        if (proc.state && proc.state === "none") {
            return setTimeout(function () {
                God.stopProcessId(id, cb);
            }, 250);
        }

        console.log("Stopping app:%s id:%s", proc.pm2_env.name, proc.pm2_env.pm_id);
        proc.pm2_env.status = cst.STOPPING_STATUS;

        if (!proc.process.pid) {
            console.error("app=%s id=%d does not have a pid", proc.pm2_env.name, proc.pm2_env.pm_id);
            proc.pm2_env.status = cst.STOPPED_STATUS;
            return cb(null, { error: true, message: "could not kill process w/o pid" });
        }

        God.killProcess(proc.process.pid, proc.pm2_env, function (err) {
            proc.pm2_env.status = cst.STOPPED_STATUS;

            God.notify("exit", proc);

            if (err && err.type && err.type === "timeout") {
                console.error("app=%s id=%d pid=%s could not be stopped",
                    proc.pm2_env.name,
                    proc.pm2_env.pm_id,
                    proc.process.pid);
                proc.pm2_env.status = cst.ERRORED_STATUS;
                return cb(null, God.getFormatedProcess(id));
            }

            if (proc.pm2_env.pm_id.toString().indexOf("_old_") !== 0) {
                try {
                    fs.unlinkSync(proc.pm2_env.pm_pid_path);
                } catch (e) { }
            }

            if (proc.pm2_env.axm_actions) {
                proc.pm2_env.axm_actions = [];
            }
            if (proc.pm2_env.axm_monitor) {
                proc.pm2_env.axm_monitor = {};
            }

            proc.process.pid = 0;
            return cb(null, God.getFormatedProcess(id));
        });
    },

    resetMetaProcessId: function (id, cb) {
        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError(id + " id unknown"), {});
        }

        if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
            return cb(God.logAndGenerateError("Error when getting proc || proc.pm2_env"), {});
        }

        God.clusters_db[id].pm2_env.created_at = Utility.getDate();
        God.clusters_db[id].pm2_env.unstable_restarts = 0;
        God.clusters_db[id].pm2_env.restart_time = 0;

        return cb(null, God.getFormatedProcesses());
    },

    /**
     * Delete a process by id
     * It will stop it and remove it from the database
     * @method deleteProcessId
     * @param {} id
     * @param {} cb
     * @return Literal
     */
    deleteProcessId: function (id, cb) {
        God.deleteCron(id);

        God.stopProcessId(id, function (err, proc) {
            if (err) {
                return cb(God.logAndGenerateError(err), {});
            }
            // ! transform to slow object
            delete God.clusters_db[id];

            if (Object.keys(God.clusters_db).length == 0) {
                God.next_id = 0;
            }
            return cb(null, proc);
        });
        return false;
    },

    /**
     * Restart a process ID
     * If the process is online it will not put it on state stopped
     * but directly kill it and let God restart it
     * @method restartProcessId
     * @param {} id
     * @param {} cb
     * @return Literal
     */
    restartProcessId: function (opts, cb) {
        const id = opts.id;
        const env = opts.env || {};

        if (typeof (id) === "undefined") {
            return cb(God.logAndGenerateError("opts.id not passed to restartProcessId", opts));
        }
        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError("God db process id unknown"), {});
        }

        const proc = God.clusters_db[id];

        God.resetState(proc.pm2_env);

        /**
         * Merge new application configuration on restart
         * Same system in reloadProcessId and softReloadProcessId
         */
        Utility.extend(proc.pm2_env.env, env);
        Utility.extendExtraConfig(proc, opts);

        if (God.pm2_being_killed) {
            return cb(God.logAndGenerateError("[RestartProcessId] PM2 is being killed, stopping restart procedure..."));
        }
        if (proc.pm2_env.status === cst.ONLINE_STATUS || proc.pm2_env.status === cst.LAUNCHING_STATUS) {
            God.stopProcessId(id, function (err) {
                if (God.pm2_being_killed) {
                    return cb(God.logAndGenerateError("[RestartProcessId] PM2 is being killed, stopping restart procedure..."));
                }
                proc.pm2_env.restart_time += 1;
                return God.startProcessId(id, cb);
            });

            return false;
        } else {
            debug("[restart] process not online, starting it");
            return God.startProcessId(id, cb);
        }
    },


    /**
     * Restart all process by name
     * @method restartProcessName
     * @param {} name
     * @param {} cb
     * @return Literal
     */
    restartProcessName: function (name, cb) {
        const processes = God.findByName(name);

        if (processes && processes.length === 0) {
            return cb(God.logAndGenerateError("Unknown process"), {});
        }

        eachLimit(processes, cst.CONCURRENT_ACTIONS, function (proc, next) {
            if (God.pm2_being_killed) {
                return next("[Watch] PM2 is being killed, stopping restart procedure...");
            }
            if (proc.pm2_env.status === cst.ONLINE_STATUS) {
                return God.restartProcessId({ id: proc.pm2_env.pm_id }, next);
            } else if (proc.pm2_env.status !== cst.STOPPING_STATUS
                && proc.pm2_env.status !== cst.LAUNCHING_STATUS) {
                return God.startProcessId(proc.pm2_env.pm_id, next);
            } else {
                return next(util.format("[Watch] Process name %s is being stopped so I won't restart it", name));
            }
        }, function (err) {
            if (err) {
                return cb(God.logAndGenerateError(err));
            }
            return cb(null, God.getFormatedProcesses());
        });

        return false;
    },

    /**
     * Send system signal to process id
     * @method sendSignalToProcessId
     * @param {} opts
     * @param {} cb
     * @return CallExpression
     */
    sendSignalToProcessId: function (opts, cb) {
        const id = opts.process_id;
        const signal = opts.signal;

        if (!(id in God.clusters_db)) {
            return cb(God.logAndGenerateError(id + " id unknown"), {});
        }

        // const proc = God.clusters_db[id];

        //God.notify('send signal ' + signal, proc, true);

        try {
            process.kill(God.clusters_db[id].process.pid, signal);
        } catch (e) {
            return cb(God.logAndGenerateError("Error when sending signal (signal unknown)"), {});
        }
        return cb(null, God.getFormatedProcesses());
    },

    /**
     * Send system signal to all processes by name
     * @method sendSignalToProcessName
     * @param {} opts
     * @param {} cb
     * @return
     */
    sendSignalToProcessName: function (opts, cb) {
        const processes = God.findByName(opts.process_name);
        const signal = opts.signal;

        if (processes && processes.length === 0) {
            return cb(God.logAndGenerateError("Unknown process name"), {});
        }

        eachLimit(processes, cst.CONCURRENT_ACTIONS, function (proc, next) {
            if (proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS) {
                try {
                    process.kill(proc.process.pid, signal);
                } catch (e) {
                    return next(e);
                }
            }
            return setTimeout(next, 200);
        }, function (err) {
            if (err) {
                return cb(God.logAndGenerateError(err), {});
            }
            return cb(null, God.getFormatedProcesses());
        });

    },

    /**
     * Stop watching daemon
     * @method stopWatch
     * @param {} method
     * @param {} value
     * @param {} fn
     * @return
     */
    stopWatch: function (method, value, fn) {
        let env = null;

        if (method == "stopAll" || method == "deleteAll") {
            const processes = God.getFormatedProcesses();

            processes.forEach(function (proc) {
                God.clusters_db[proc.pm_id].pm2_env.watch = false;
                God.watch.disable(proc.pm2_env);
            });

        } else {

            if (method.indexOf("ProcessId") !== -1) {
                env = God.clusters_db[value];
            } else if (method.indexOf("ProcessName") !== -1) {
                // TODO: this fn cannot work, please check
                // env = God.clusters_db[God.findByName(value)];
            }

            if (env) {
                God.watch.disable(env.pm2_env);
                env.pm2_env.watch = false;
            }
        }
        return fn(null, { success: true });
    },


    /**
     * Toggle watching daemon
     * @method toggleWatch
     * @param {String} method
     * @param {Object} application environment, should include id
     * @param {Function} callback
     */
    toggleWatch: function (method, value, fn) {
        let env = null;

        if (method == "restartProcessId") {
            env = God.clusters_db[value.id];
        } else if (method == "restartProcessName") {
            // TODO: this fn cannot work, please check
            // env = God.clusters_db[God.findByName(value)];
        }

        if (env) {
            env.pm2_env.watch = !env.pm2_env.watch;
            if (env.pm2_env.watch) {
                God.watch.enable(env.pm2_env);
            } else {
                God.watch.disable(env.pm2_env);
            }
        }

        return fn(null, { success: true });
    },

    /**
     * Start Watch
     * @method startWatch
     * @param {String} method
     * @param {Object} application environment, should include id
     * @param {Function} callback
     */
    startWatch: function (method, value, fn) {
        let env = null;

        if (method == "restartProcessId") {
            env = God.clusters_db[value.id];
        } else if (method == "restartProcessName") {
            // TODO: this fn cannot work, please check
            // env = God.clusters_db[God.findByName(value)];
        }

        if (env) {
            if (env.pm2_env.watch) {
                return fn(null, { success: true, notrestarted: true });
            }

            God.watch.enable(env.pm2_env);
            //env.pm2_env.env.watch = true;
            env.pm2_env.watch = true;
        }

        return fn(null, { success: true });
    },

    /**
     * Description
     * @method reloadLogs
     * @param {} opts
     * @param {} cb
     * @return CallExpression
     */
    reloadLogs: function (opts, cb) {
        console.log("Reloading logs...");
        const processIds = Object.keys(God.clusters_db);

        processIds.forEach(function (id) {
            const cluster = God.clusters_db[id];

            console.log("Reloading logs for process id %d", id);

            if (cluster && cluster.pm2_env) {
                // Cluster mode
                if (cluster.send && cluster.pm2_env.exec_mode == "cluster_mode") {
                    try {
                        cluster.send({
                            type: "log:reload"
                        });
                    } catch (e: any) {
                        console.error(e.message || e);
                    }
                } else if (cluster._reloadLogs) {// Fork mode
                    cluster._reloadLogs(function (err) {
                        if (err) {
                            God.logAndGenerateError(err);
                        }
                    });
                }
            }
        });

        return cb(null, {});
    },

    /**
     * Send Line To Stdin
     * @method sendLineToStdin
     * @param Object packet
     * @param String pm_id Process ID
     * @param String line  Line to send to process stdin
     */
    sendLineToStdin: function (packet, cb) {
        if (typeof (packet.pm_id) == "undefined" || !packet.line) {
            return cb(God.logAndGenerateError("pm_id or line field missing"), {});
        }

        const pm_id = packet.pm_id;
        const line = packet.line;

        const proc = God.clusters_db[pm_id];

        if (!proc) {
            return cb(God.logAndGenerateError("Process with ID <" + pm_id + "> unknown."), {});
        }

        if (proc.pm2_env.exec_mode == "cluster_mode") {
            return cb(God.logAndGenerateError("Cannot send line to processes in cluster mode"), {});
        }

        if (proc.pm2_env.status != cst.ONLINE_STATUS && proc.pm2_env.status != cst.LAUNCHING_STATUS) {
            return cb(God.logAndGenerateError("Process with ID <" + pm_id + "> offline."), {});
        }

        try {
            proc.stdin.write(line, function () {
                return cb(null, {
                    pm_id: pm_id,
                    line: line
                });
            });
        } catch (e) {
            return cb(God.logAndGenerateError(e), {});
        }
    },

    /**
     * @param {object} packet
     * @param {function} cb
     */
    sendDataToProcessId: function (packet, cb) {
        if (typeof (packet.id) == "undefined" ||
            typeof (packet.data) == "undefined" ||
            !packet.topic) {
            return cb(God.logAndGenerateError("ID, DATA or TOPIC field is missing"), {});
        }

        const pm_id = packet.id;
        // const data = packet.data;

        const proc = God.clusters_db[pm_id];

        if (!proc) {
            return cb(God.logAndGenerateError("Process with ID <" + pm_id + "> unknown."), {});
        }

        if (proc.pm2_env.status != cst.ONLINE_STATUS && proc.pm2_env.status != cst.LAUNCHING_STATUS) {
            return cb(God.logAndGenerateError("Process with ID <" + pm_id + "> offline."), {});
        }

        try {
            proc.send(packet);
        } catch (e) {
            return cb(God.logAndGenerateError(e), {});
        }

        return cb(null, {
            success: true,
            data: packet
        });
    },

    /**
     * Send Message to Process by id or name
     * @method msgProcess
     * @param {} cmd
     * @param {} cb
     * @return Literal
     */
    msgProcess: function (cmd, cb) {
        if ("id" in cmd) {
            const id = cmd.id;
            if (!(id in God.clusters_db)) {
                return cb(God.logAndGenerateError(id + " id unknown"), {});
            }
            const proc = God.clusters_db[id];

            let action_exist = false;

            proc.pm2_env.axm_actions.forEach(function (action) {
                if (action.action_name == cmd.msg) {
                    action_exist = true;
                    // Reset output buffer
                    action.output = [];
                }
            });
            if (action_exist == false) {
                return cb(God.logAndGenerateError("Action doesn't exist " + cmd.msg + " for " + proc.pm2_env.name), {});
            }

            if (proc.pm2_env.status == cst.ONLINE_STATUS || proc.pm2_env.status == cst.LAUNCHING_STATUS) {
                /*
                 * Send message
                 */
                if (cmd.opts == null && !cmd.uuid) {
                    proc.send(cmd.msg);
                } else {
                    proc.send(cmd);
                }

                return cb(null, { process_count: 1, success: true });
            } else {
                return cb(God.logAndGenerateError(id + " : id offline"), {});
            }
        } else if ("name" in cmd) {
            /*
             * As names are not unique in case of cluster, this
             * will send msg to all process matching  'name'
             */
            const name = cmd.name;
            const arr = Object.keys(God.clusters_db);
            let sent = 0;

            (function ex(arr) {
                if (arr[0] == null || !arr) {
                    return cb(null, {
                        process_count: sent,
                        success: true
                    });
                }

                const id = arr[0];

                if (!God.clusters_db[id] || !God.clusters_db[id].pm2_env) {
                    arr.shift();
                    return ex(arr);
                }

                const proc_env = God.clusters_db[id].pm2_env;

                const isActionAvailable = proc_env.axm_actions.find(action => action.action_name === cmd.msg) !== undefined;

                // if action doesn't exist for this app
                // try with the next one
                if (isActionAvailable === false) {
                    arr.shift();
                    return ex(arr);
                }


                if ((p.basename(proc_env.pm_exec_path) == name ||
                    proc_env.name == name ||
                    proc_env.namespace == name ||
                    name == "all") &&
                    (proc_env.status == cst.ONLINE_STATUS ||
                        proc_env.status == cst.LAUNCHING_STATUS)) {

                    let action_exist;
                    proc_env.axm_actions.forEach(function (action) {
                        if (action.action_name == cmd.msg) {
                            action_exist = true;
                        }
                    });

                    if (action_exist == false || proc_env.axm_actions.length == 0) {
                        arr.shift();
                        return ex(arr);
                    }

                    if (cmd.opts == null) {
                        God.clusters_db[id].send(cmd.msg);
                    } else {
                        God.clusters_db[id].send(cmd);
                    }

                    sent++;
                    arr.shift();
                    return ex(arr);
                } else {
                    arr.shift();
                    return ex(arr);
                }
                return false;
            })(arr);
        } else {
            return cb(God.logAndGenerateError("method requires name or id field"), {});
        }
        return false;
    },

    /**
     * Description
     * @method getVersion
     * @param {} env
     * @param {} cb
     * @return CallExpression
     */
    getVersion: function (env, cb) {
        process.nextTick(function () {
            return cb(null, pkg.version);
        });
    },

    monitor: function Monitor(pm_id, cb) {
        if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
            return cb(new Error("Unknown pm_id"));
        }

        God.clusters_db[pm_id].pm2_env._km_monitored = true;
        return cb(null, { success: true, pm_id: pm_id });
    },

    unmonitor: function Monitor(pm_id, cb) {
        if (!God.clusters_db[pm_id] || !God.clusters_db[pm_id].pm2_env) {
            return cb(new Error("Unknown pm_id"));
        }

        God.clusters_db[pm_id].pm2_env._km_monitored = false;
        return cb(null, { success: true, pm_id: pm_id });
    },

    getReport: function (arg, cb) {
        const report = {
            pm2_version: pkg.version,
            node_version: "N/A",
            node_path: process.env["_"] || "not found",
            argv0: process.argv0,
            argv: process.argv,
            user: process.env.USER,
            uid: (cst.IS_WINDOWS === false && process.geteuid) ? process.geteuid() : "N/A",
            gid: (cst.IS_WINDOWS === false && process.getegid) ? process.getegid() : "N/A",
            env: process.env,
            managed_apps: Object.keys(God.clusters_db).length,
            started_at: God.started_at
        };

        if (process.versions && process.versions.node) {
            report.node_version = process.versions.node;
        }

        process.nextTick(function () {
            return cb(null, report);
        });
    },

    /**
     * From ActionMethods - End
     */

    /**
     * From Worker - Start
     */

    getCronID: function (pm_id) {
        return `cron-${pm_id}`;
    },

    registerCron: function (pm2_env) {
        if (!pm2_env ||
            pm2_env.pm_id === undefined ||
            !pm2_env.cron_restart ||
            God.CronJobs.has(God.getCronID(pm2_env.pm_id))) {
            return;
        }

        console.log("[PM2][WORKER] Registering a cron job on:", pm2_env.pm_id);

        const job = new CronJob({
            cronTime: pm2_env.cron_restart,
            onTick: function () {
                God.softReloadProcessId({ id: pm2_env.pm_id }, function (err, data) {
                    if (err) {
                        console.error(err.stack || err);
                    }
                    return;
                });
            },
            start: false
        });

        job.start();
        God.CronJobs.set(God.getCronID(pm2_env.pm_id), job);
    },


    /**
     * Deletes the cron job on deletion of process
     */
    deleteCron: function (id) {
        if (typeof (id) !== "undefined" && God.CronJobs.has(God.getCronID(id)) === false) {
            return;
        }
        console.log("[PM2] Deregistering a cron job on:", id);
        const job = God.CronJobs.get(God.getCronID(id));
        job.stop();
        God.CronJobs.delete(God.getCronID(id));
    },

    /**
     * From Worker - End
     */
};

Utility.overrideConsole(God.bus);

God.init();

export default God;

/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

/**
 * Common Utilities ONLY USED IN ->CLI<-
 */

import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import fclone from "fclone";
import semver from "semver";
import dayjs from "dayjs";
import yamljs from "yamljs";
import vm from "vm";
import mkdirp from "mkdirp";
import { execSync } from "child_process";
import { CronJob } from "cron";

import isBinary from "./tools/isbinaryfile";
import cst from "./constants";
import extItps from "./API/interpreter";
import Config from "./tools/Config";
import pkg from "../package.json";
import which from "./tools/which";
import passwd from "./tools/passwd";

function homedir() {
    const env = process.env;
    const home = env.HOME;
    const user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

    if (process.platform === "win32") {
        return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
    }

    if (process.platform === "darwin") {
        return home || (user ? "/Users/" + user : null);
    }

    if (process.platform === "linux") {
        return home || (process.getuid() === 0 ? "/root" : (user ? "/home/" + user : null));
    }

    return home || null;
}

function resolveHome(filepath) {
    if (filepath[0] === "~") {
        return path.join(homedir(), filepath.slice(1));
    }
    return filepath;
}

/**
 * Show warnings
 * @param {String} warning
 */
function warn(warning) {
    Common.printOut(cst.PREFIX_MSG_WARNING + warning);
}

const resolveNodeInterpreter = function (app) {
    if (app.exec_mode && app.exec_mode.indexOf("cluster") > -1) {
        Common.printError(cst.PREFIX_MSG_WARNING + chalk.bold.yellow("Choosing the Node.js version in cluster mode is not supported"));
        return false;
    }

    const nvm_path = cst.IS_WINDOWS ? process.env.NVM_HOME : process.env.NVM_DIR;
    if (!nvm_path) {
        // Common.printError(cst.PREFIX_MSG_ERR + chalk.red("NVM is not available in PATH"));
        Common.printError(new Error(cst.PREFIX_MSG_ERR + chalk.red("NVM is not available in PATH")).stack);
        // Common.printError(cst.PREFIX_MSG_ERR + chalk.red("Fallback to node in PATH"));
        Common.printError(new Error(cst.PREFIX_MSG_ERR + chalk.red("Fallback to node in PATH")).stack);
        const msg = cst.IS_WINDOWS
            ? "https://github.com/coreybutler/nvm-windows/releases/"
            : "$ curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash";
        // Common.printOut(cst.PREFIX_MSG_ERR + chalk.bold("Install NVM:\n" + msg));
        Common.printOut(new Error(cst.PREFIX_MSG_ERR + chalk.bold("Install NVM:\n" + msg)).stack);
    } else {
        const node_version = app.exec_interpreter.split("@")[1];
        const path_to_node = cst.IS_WINDOWS
            ? "/v" + node_version + "/node.exe"
            : semver.satisfies(node_version, ">= 0.12.0")
                ? "/versions/node/v" + node_version + "/bin/node"
                : "/v" + node_version + "/bin/node";
        let nvm_node_path = path.join(nvm_path, path_to_node);
        try {
            fs.accessSync(nvm_node_path);
        } catch (e) {
            Common.printOut(cst.PREFIX_MSG + "Installing Node v%s", node_version);
            const nvm_bin = path.join(nvm_path, "nvm." + (cst.IS_WINDOWS ? "exe" : "sh"));
            const nvm_cmd = cst.IS_WINDOWS
                ? nvm_bin + " install " + node_version
                : ". " + nvm_bin + " ; nvm install " + node_version;

            Common.printOut(cst.PREFIX_MSG + "Executing: %s", nvm_cmd);

            execSync(nvm_cmd, {
                cwd: path.resolve(process.cwd()),
                env: process.env,
                maxBuffer: 20 * 1024 * 1024
            });

            // in order to support both arch, nvm for Windows renames 'node.exe' to:
            // 'node32.exe' for x32 arch
            // 'node64.exe' for x64 arch
            if (cst.IS_WINDOWS) {
                nvm_node_path = nvm_node_path.replace(/node/, "node" + process.arch.slice(1));
            }
        }

        Common.printOut(cst.PREFIX_MSG + chalk.green.bold("Setting Node to v%s (path=%s)"),
            node_version,
            nvm_node_path);

        app.exec_interpreter = nvm_node_path;
    }
};

const Common = {

    determineSilentCLI: () => {
        // pm2 should ignore -s --silent -v if they are after '--'
        const variadicArgsDashesPos = process.argv.indexOf("--");
        const s1opt = process.argv.indexOf("--silent");
        const s2opt = process.argv.indexOf("-s");

        if (process.env.PM2_SILENT || (variadicArgsDashesPos > -1 &&
            (s1opt != -1 && s1opt < variadicArgsDashesPos) &&
            (s2opt != -1 != s2opt < variadicArgsDashesPos)) ||
            (variadicArgsDashesPos == -1 && (s1opt > -1 || s2opt > -1))) {
            for (const key in console) {
                const code = key.charCodeAt(0);
                if (code >= 97 && code <= 122) {
                    console[key] = () => {
                        // do nothing
                    };
                }
            }
            process.env.PM2_DISCRETE_MODE = "true";
        }
    },

    printVersion: () => {
        const variadicArgsDashesPos = process.argv.indexOf("--");

        if (process.argv.indexOf("-v") > -1 && process.argv.indexOf("-v") < variadicArgsDashesPos) {
            console.log(pkg.version);
            process.exit(0);
        }
    },

    lockReload: () => {
        try {
            const t1 = fs.readFileSync(cst.PM2_RELOAD_LOCKFILE).toString();

            // Check if content and if time < 30 return locked
            // Else if content detected (lock file staled), allow and rewritte
            if (t1 && t1 != "") {
                const diff = dayjs().diff(parseInt(t1));
                if (diff < cst.RELOAD_LOCK_TIMEOUT) {
                    return diff;
                }
            }
        } catch (e) { }

        try {
            // Write latest timestamp
            fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, dayjs().valueOf().toString());
            return 0;
        } catch (e: any) {
            console.error(e.message || e);
        }
    },

    unlockReload: () => {
        try {
            fs.writeFileSync(cst.PM2_RELOAD_LOCKFILE, "");
        } catch (e: any) {
            console.error(e.message || e);
        }
    },

    /**
     * Resolve app paths and replace missing values with defaults.
     * @method prepareAppConf
     * @param app {Object}
     * @param {} cwd
     * @param {} outputter
     * @return app
     */
    prepareAppConf: (opts, app) => {
        /**
         * Minimum validation
         */
        if (!app.script) {
            return new Error("No script path - aborting");
        }

        let cwd = null;

        if (app.cwd) {
            cwd = path.resolve(app.cwd);
            process.env.PWD = app.cwd;
        }

        if (!app.node_args) {
            app.node_args = [];
        }

        if (app.port && app.env) {
            app.env.PORT = app.port;
        }

        // CWD option resolving
        cwd && (cwd[0] != "/") && (cwd = path.resolve(process.cwd(), cwd));
        cwd = cwd || opts.cwd;

        // Full path script resolution
        app.pm_exec_path = path.resolve(cwd, app.script);

        // If script does not exist after resolution
        if (!fs.existsSync(app.pm_exec_path)) {
            let ckd;
            // Try resolve command available in $PATH
            if ((ckd = which(app.script))) {
                if (typeof (ckd) !== "string") {
                    ckd = ckd.toString();
                }
                app.pm_exec_path = ckd;
            } else { // Throw critical error
                return new Error(`Script not found: ${app.pm_exec_path}`);
            }
        }

        /**
         * Auto detect .map file and enable source map support automatically
         */
        if (app.disable_source_map_support != true) {
            try {
                fs.accessSync(app.pm_exec_path + ".map", fs.constants.R_OK);
                app.source_map_support = true;
            } catch (e) { }
            delete app.disable_source_map_support;
        }

        delete app.script;

        // Set current env by first adding the process environment and then extending/replacing it
        // with env specified on command-line or JSON file.

        let env = {};

        /**
         * Do not copy internal pm2 environment variables if acting on process
         * is made from a programmatic script started by PM2 or if a pm_id is present in env
         */
        if (cst.PM2_PROGRAMMATIC || process.env.pm_id) {
            Common.safeExtend(env, process.env);
        } else {
            env = process.env;
        }

        const filterEnv = (envObj) => {
            if (app.filter_env == true) {
                return {};
            }

            if (typeof app.filter_env === "string") {
                delete envObj[app.filter_env];
                return envObj;
            }

            const new_env = {};
            const allowedKeys = app.filter_env.reduce((acc, current) =>
                acc.filter(item => !item.includes(current)), Object.keys(envObj));
            allowedKeys.forEach(key => new_env[key] = envObj[key]);
            return new_env;
        };

        app.env = [
            {}, (app.filter_env && app.filter_env.length > 0) ? filterEnv(process.env) : env, app.env || {}
        ].reduce((e1, e2) => {
            e1 = { ...e1, ...e2 };
            return e1;
        });

        app.pm_cwd = cwd;
        // Interpreter
        try {
            Common.sink.resolveInterpreter(app);
        } catch (e) {
            return e;
        }

        // Exec mode and cluster stuff
        Common.sink.determineExecMode(app);

        /**
         * Scary
         */
        const formated_app_name = app.name.replace(/[^a-zA-Z0-9\\.\\-]/g, "-");

        ["log", "out", "error", "pid"].forEach((f) => {
            let af = app[f + "_file"], ps;
            const isStd = !~["log", "pid"].indexOf(f);
            const ext = (f == "pid" ? "pid" : "log");
            if (af) {
                af = resolveHome(af);
            }

            if ((f == "log" && typeof af == "boolean" && af) || (f != "log" && !af)) {
                ps = [cst["DEFAULT_" + ext.toUpperCase() + "_PATH"], formated_app_name + (isStd ? "-" + f : "") + "." + ext];
            } else if ((f != "log" || (f == "log" && af)) && af !== "NULL" && af !== "/dev/null") {
                ps = [cwd, af];

                const dir = path.dirname(path.resolve(cwd, af));
                if (!fs.existsSync(dir)) {
                    Common.printError(cst.PREFIX_MSG_WARNING + "Folder does not exist: " + dir);
                    Common.printOut(cst.PREFIX_MSG + "Creating folder: " + dir);
                    try {
                        mkdirp.sync(dir);
                    } catch (err) {
                        // Common.printError(cst.PREFIX_MSG_ERR + "Could not create folder: " + path.dirname(af));
                        Common.printError(new Error(cst.PREFIX_MSG_ERR + "Could not create folder: " + path.dirname(af)).stack);
                        throw new Error("Could not create folder");
                    }
                }

            }
            // PM2 paths
            if (af !== "NULL" && af !== "/dev/null") {
                ps && (app["pm_" + (isStd ? f.substr(0, 3) + "_" : "") + ext + "_path"] = path.resolve.apply(null, ps));
            } else if (path.sep === "\\") {
                app["pm_" + (isStd ? f.substr(0, 3) + "_" : "") + ext + "_path"] = "\\\\.\\NUL";
            } else {
                app["pm_" + (isStd ? f.substr(0, 3) + "_" : "") + ext + "_path"] = "/dev/null";
            }
            delete app[f + "_file"];
        });

        return app;
    },

    /**
     * Check if filename is a configuration file
     * @param {string} filename
     * @return {mixed} null if not conf file, json or yaml if conf
     */
    isConfigFile: (filename) => {
        if (typeof (filename) !== "string") {
            return null;
        }
        if (filename.indexOf(".json") !== -1) {
            return "json";
        }
        if (filename.indexOf(".yml") > -1 || filename.indexOf(".yaml") > -1) {
            return "yaml";
        }
        if (filename.indexOf(".config.js") !== -1) {
            return "js";
        }
        if (filename.indexOf(".config.cjs") !== -1) {
            return "js";
        }
        if (filename.indexOf(".config.mjs") !== -1) {
            return "mjs";
        }
        return null;
    },

    /**
     * Parses a config file like ecosystem.config.js. Supported formats: JS, JSON, JSON5, YAML.
     * @param {string} confString  contents of the config file
     * @param {string} filename    path to the config file
     * @return {Object} config object
     */
    parseConfig: (confObj, filename) => {
        if (!filename ||
            filename == "pipe" ||
            filename == "none" ||
            filename.indexOf(".json") > -1) {
            const code = "(" + confObj + ")";
            // const sandbox = {};

            // TODO: Please check this
            // return vm.runInThisContext(code, sandbox, {
            //   filename: path.resolve(filename),
            //   displayErrors: false,
            //   timeout: 1000
            // });
            return vm.runInThisContext(code, {
                filename: path.resolve(filename),
                displayErrors: false,
                timeout: 1000
            });
        } else if (filename.indexOf(".yml") > -1 ||
            filename.indexOf(".yaml") > -1) {
            return yamljs.parse(confObj.toString());
        } else if (filename.indexOf(".config.js") > -1 || filename.indexOf(".config.cjs") > -1 || filename.indexOf(".config.mjs") > -1) {
            const confPath = require.resolve(path.resolve(filename));
            delete require.cache[confPath];
            return require(confPath);
        }
    },

    retErr: (e) => {
        if (!e) {
            return new Error("Unidentified error");
        }
        if (e instanceof Error) {
            return e;
        }
        return new Error(e);
    },

    sink: {
        determineCron: (app) => {

            if (app.cron_restart) {
                try {
                    Common.printOut(cst.PREFIX_MSG + "cron restart at " + app.cron_restart);
                    new CronJob(app.cron_restart, () => {
                        Common.printOut(cst.PREFIX_MSG + "cron pattern for auto restart detected and valid");
                    });
                } catch (ex: any) {
                    return new Error(`Cron pattern error: ${ex.message}`);
                }
            }
        },

        /**
         * Handle alias (fork <=> fork_mode, cluster <=> cluster_mode)
         */
        determineExecMode: (app) => {
            if (app.exec_mode) {
                app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, "$1_mode");
            }

            /**
             * Here we put the default exec mode
             */
            if (!app.exec_mode &&
                (app.instances >= 1 || app.instances === 0 || app.instances === -1) &&
                app.exec_interpreter.indexOf("node") > -1) {
                app.exec_mode = "cluster_mode";
            } else if (!app.exec_mode) {
                app.exec_mode = "fork_mode";
            }
            if (typeof app.instances == "undefined") {
                app.instances = 1;
            }
        },

        /**
         * Resolve interpreter
         */
        resolveInterpreter: (app) => {
            const noInterpreter = !app.exec_interpreter;
            const extName = path.extname(app.pm_exec_path);
            const betterInterpreter = extItps[extName];

            // No interpreter defined and correspondance in schema hashmap
            if (noInterpreter && betterInterpreter) {
                app.exec_interpreter = betterInterpreter;
            } else if (noInterpreter) {
                // Else if no Interpreter detect if process is binary
                app.exec_interpreter = isBinary(app.pm_exec_path) ? "none" : "node";
            } else if (app.exec_interpreter.indexOf("node@") > -1) {
                resolveNodeInterpreter(app);
            }

            if (app.exec_interpreter.indexOf("python") > -1) {
                app.env.PYTHONUNBUFFERED = "1";
            }

            /**
             * Specific installed JS transpilers
             */
            if (app.exec_interpreter == "ts-node") {
                app.exec_interpreter = path.resolve(__dirname, "../node_modules/.bin/ts-node");
            }

            if (app.exec_interpreter == "lsc") {
                app.exec_interpreter = path.resolve(__dirname, "../node_modules/.bin/lsc");
            }

            if (app.exec_interpreter == "coffee") {
                app.exec_interpreter = path.resolve(__dirname, "../node_modules/.bin/coffee");
            }

            if (app.exec_interpreter != "none" && which(app.exec_interpreter) == null) {
                // If node is not present
                if (app.exec_interpreter == "node") {
                    Common.warn(`Using builtin node.js version on version ${process.version}`);
                    app.exec_interpreter = cst.BUILTIN_NODE_PATH;
                } else {
                    throw new Error(`Interpreter ${app.exec_interpreter} is NOT AVAILABLE in PATH. (type 'which ${app.exec_interpreter}' to double check.)`);
                }
            }

            return app;
        },
    },

    deepCopy: (obj) => {
        if (obj === null || obj === undefined) {
            return {};
        }
        return fclone(obj);
    },

    serialize: (obj) => {
        if (obj === null || obj === undefined) {
            return {};
        }
        return fclone(obj);
    },

    clone: (obj) => {
        if (obj === null || obj === undefined) {
            return {};
        }
        return fclone(obj);
    },

    errMod: (msg) => {
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        if (msg instanceof Error) {
            return console.error(msg.message);
        }
        return console.error(`${cst.PREFIX_MSG_MOD_ERR}${msg}`);
    },

    err: (msg) => {
        console.log("Error 1");
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        if (msg instanceof Error) {
            console.log("Error 11");
            // return console.error(`${cst.PREFIX_MSG_ERR}${msg.message}`);
            return console.error(`${cst.PREFIX_MSG_ERR}${msg.stack}`);
        }
        console.trace("Error 12");
        return console.error(`${cst.PREFIX_MSG_ERR}${msg}`);
    },

    printError: (...args) => {
        console.log("Error 2");
        const [ msg ] = args;
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        if (msg instanceof Error) {
            console.log("Error 21");
            // return console.error(msg.message);
            return console.error(msg.stack);
        }
        console.log("Error 22");
        // return console.error(...args);
        return console.error(...args);
    },

    log: (msg) => {
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        return console.log(`${cst.PREFIX_MSG}${msg}`);
    },

    info: (msg) => {
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        return console.log(`${cst.PREFIX_MSG_INFO}${msg}`);
    },

    warn: (msg) => {
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        return console.log(`${cst.PREFIX_MSG_WARNING}${msg}`);
    },

    logMod: (msg) => {
        if (process.env.PM2_SILENT || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        return console.log(`${cst.PREFIX_MSG_MOD}${msg}`);
    },

    printOut: (...args) => {
        if (process.env.PM2_SILENT === "true" || process.env.PM2_PROGRAMMATIC === "true") {
            return false;
        }
        // return console.log.apply(console, arguments);
        return console.log(...args);
    },

    /**
     * Raw extend
     */
    extend: (destination, source) => {
        if (typeof destination !== "object") {
            destination = {};
        }
        if (!source || typeof source !== "object") {
            return destination;
        }

        Object.keys(source).forEach(function (new_key) {
            if (source[new_key] != "[object Object]") {
                destination[new_key] = source[new_key];
            }
        });

        return destination;
    },

    /**
     * This is useful when starting script programmatically
     */
    safeExtend: (origin, add) => {
        if (!add || typeof add != "object") {
            return origin;
        }

        //Ignore PM2's set environment variables from the nested env
        const keysToIgnore = ["name", "exec_mode", "env", "args", "pm_cwd", "exec_interpreter", "pm_exec_path", "node_args", "pm_out_log_path", "pm_err_log_path", "pm_pid_path", "pm_id", "status", "pm_uptime", "created_at", "windowsHide", "username", "merge_logs", "kill_retry_time", "prev_restart_delay", "instance_var", "unstable_restarts", "restart_time", "axm_actions", "pmx_module", "command", "watch", "filter_env", "versioning", "vizion_runing", "MODULE_DEBUG", "pmx", "axm_options", "created_at", "watch", "vizion", "axm_dynamic", "axm_monitor", "instances", "automation", "autorestart", "unstable_restart", "treekill", "exit_code", "vizion"];

        const keys = Object.keys(add);
        let i = keys.length;
        while (i--) {
            //Only copy stuff into the env that we don't have already.
            if (keysToIgnore.indexOf(keys[i]) == -1 && add[keys[i]] != "[object Object]") {
                origin[keys[i]] = add[keys[i]];
            }
        }
        return origin;
    },

    /**
     * Extend the app.env object of with the properties taken from the
     * app.env_[envName] and deploy configuration.
     * Also update current json attributes
     *
     * Used only for Configuration file processing
     *
     * @param {Object} app The app object.
     * @param {string} envName The given environment name.
     * @param {Object} deployConf Deployment configuration object (from JSON file or whatever).
     * @returns {Object} The app.env variables object.
     */
    mergeEnvironmentVariables: (app_env, env_name?, deploy_conf?) => {
        const app = fclone(app_env);

        let new_conf: any = {
            env: {}
        };

        // Stringify possible object
        for (const key in app.env) {
            if (typeof app.env[key] == "object") {
                app.env[key] = JSON.stringify(app.env[key]);
            }
        }

        /**
         * Extra configuration update
         */
        new_conf = { ...new_conf, ...app };

        if (env_name) {
            // First merge variables from deploy.production.env object as least priority.
            if (deploy_conf && deploy_conf[env_name] && deploy_conf[env_name]["env"]) {
                new_conf.env = { ...new_conf.env, ...deploy_conf[env_name]["env"] };
            }

            new_conf.env = { ...new_conf.env, ...app.env };

            // Then, last and highest priority, merge the app.env_production object.
            if ("env_" + env_name in app) {
                new_conf.env = { ...new_conf.env, ...app["env_" + env_name] };
            } else {
                Common.printOut(cst.PREFIX_MSG_WARNING + chalk.bold("Environment [%s] is not defined in process file"), env_name);
            }
        }

        delete new_conf.exec_mode;

        let res: any = {
            current_conf: {}
        };

        res = { ...res, ...new_conf.env };
        res.current_conf = { ...res.current_conf, ...new_conf };

        // #2541 force resolution of node interpreter
        if (app.exec_interpreter &&
            app.exec_interpreter.indexOf("@") > -1) {
            resolveNodeInterpreter(app);
            res.current_conf.exec_interpreter = app.exec_interpreter;
        }

        return res;
    },

    /**
     * This function will resolve paths, option and environment
     * CALLED before 'prepare' God call (=> PROCESS INITIALIZATION)
     * @method resolveAppAttributes
     * @param {Object} opts
     * @param {Object} opts.cwd
     * @param {Object} opts.pm2_home
     * @param {Object} appConf application configuration
     * @return app
     */
    resolveAppAttributes: (opts, conf) => {
        console.log("conf", conf);
        const conf_copy = fclone(conf);

        console.log("conf_copy", conf_copy);
        const app = Common.prepareAppConf(opts, conf_copy);
        if (app instanceof Error) {
            throw new Error(app.message);
        }
        return app;
    },

    /**
     * Verify configurations
     * Called on EVERY Operation (start/restart/reload/stop...)
     * @param {Array} appConfs
     * @returns {Array}
     */
    verifyConfs: (appConfs) => {
        if (!appConfs || appConfs.length == 0) {
            return [];
        }

        // Make sure it is an Array.
        appConfs = [].concat(appConfs);

        const verifiedConf = [];

        for (let i = 0; i < appConfs.length; i++) {
            const app = appConfs[i];

            if (app.exec_mode) {
                app.exec_mode = app.exec_mode.replace(/^(fork|cluster)$/, "$1_mode");
            }

            // JSON conf: alias cmd to script
            if (app.cmd && !app.script) {
                app.script = app.cmd;
                delete app.cmd;
            }
            // JSON conf: alias command to script
            if (app.command && !app.script) {
                app.script = app.command;
                delete app.command;
            }

            if (!app.env) {
                app.env = {};
            }

            // Render an app name if not existing.
            Common.renderApplicationName(app);

            if (app.execute_command == true) {
                app.exec_mode = "fork";
                delete app.execute_command;
            }

            app.username = Common.getCurrentUsername();

            /**
             * If command is like pm2 start "python xx.py --ok"
             * Then automatically start the script with bash -c and set a name eq to command
             */
            if (app.script && app.script.indexOf(" ") > -1 && cst.IS_WINDOWS === false) {
                const _script = app.script;

                if (which("bash")) {
                    app.script = "bash";
                    app.args = ["-c", _script];
                    if (!app.name) {
                        app.name = _script;
                    }
                } else if (which("sh")) {
                    app.script = "sh";
                    app.args = ["-c", _script];
                    if (!app.name) {
                        app.name = _script;
                    }
                } else {
                    warn("bash or sh not available in $PATH, keeping script as is");
                }
            }

            /**
             * Add log_date_format by default
             */
            if (app.time) {
                app.log_date_format = "YYYY-MM-DDTHH:mm:ss";
            }

            /**
             * Checks + Resolve UID/GID
             * comes from pm2 --uid <> --gid <> or --user
             */
            if (app.uid || app.gid || app.user) {
                // 1/ Check if windows
                if (cst.IS_WINDOWS === true) {
                    // Common.printError(cst.PREFIX_MSG_ERR + "--uid and --git does not works on windows");
                    Common.printError(new Error(cst.PREFIX_MSG_ERR + "--uid and --git does not works on windows").stack);
                    return new Error("--uid and --git does not works on windows");
                }

                // 2/ Verify that user is root (todo: verify if other has right)
                if (process.env.NODE_ENV != "test" && process.getuid && process.getuid() !== 0) {
                    // Common.printError(cst.PREFIX_MSG_ERR + "To use --uid and --gid please run pm2 as root");
                    Common.printError(new Error(cst.PREFIX_MSG_ERR + "To use --uid and --gid please run pm2 as root").stack);
                    return new Error("To use UID and GID please run PM2 as root");
                }

                // 3/ Resolve user info via /etc/password
                let users;
                try {
                    users = passwd.getUsers();
                } catch (e: any) {
                    Common.printError(e);
                    return new Error(e);
                }

                const user_info = users[app.uid || app.user];
                if (!user_info) {
                    // Common.printError(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
                    Common.printError(new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`).stack);
                    return new Error(`${cst.PREFIX_MSG_ERR} User ${app.uid || app.user} cannot be found`);
                }

                app.env.HOME = user_info.homedir;
                app.uid = parseInt(user_info.userId);

                // 4/ Resolve group id if gid is specified
                if (app.gid) {
                    let groups;
                    try {
                        groups = passwd.getGroups();
                    } catch (e: any) {
                        Common.printError(e);
                        return new Error(e);
                    }
                    const group_info = groups[app.gid];
                    if (!group_info) {
                        Common.printError(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
                        Common.printError(new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`).stack);
                        return new Error(`${cst.PREFIX_MSG_ERR} Group ${app.gid} cannot be found`);
                    }
                    app.gid = parseInt(group_info.id);
                } else {
                    app.gid = parseInt(user_info.groupId);
                }
            }

            /**
             * Specific options of PM2.io
             */
            if (process.env.PM2_DEEP_MONITORING) {
                app.deep_monitoring = true;
            }

            if (app.automation == false) {
                app.pmx = false;
            }

            if (app.disable_trace) {
                app.trace = false;
                delete app.disable_trace;
            }

            /**
             * Instances params
             */
            if (app.instances == "max") {
                app.instances = 0;
            }

            if (typeof (app.instances) === "string") {
                app.instances = parseInt(app.instances) || 0;
            }

            if (app.exec_mode != "cluster_mode" &&
                !app.instances &&
                typeof (app.merge_logs) == "undefined") {
                app.merge_logs = true;
            }

            let ret;

            if (app.cron_restart) {
                if ((ret = Common.sink.determineCron(app)) instanceof Error) {
                    return ret;
                }
            }

            /**
             * Now validation configuration
             */
            ret = Config.validateJSON(app);
            if (ret.errors && ret.errors.length > 0) {
                ret.errors.forEach(function (err) {
                    warn(err);
                });
                return new Error(ret.errors);
            }

            verifiedConf.push(ret.config);
        }

        return verifiedConf;
    },

    /**
     * Get current username
     * Called on EVERY starting app
     *
     * @returns {String}
     */
    getCurrentUsername: () => {
        let current_user = "";

        if (os.userInfo) {
            try {
                current_user = os.userInfo().username;
            } catch (err) {
                // For the case of unhandled error for uv_os_get_passwd
                // https://github.com/Unitech/pm2/issues/3184
            }
        }

        if (current_user === "") {
            current_user = process.env.USER || process.env.LNAME || process.env.USERNAME || process.env.SUDO_USER || process.env.C9_USER || process.env.LOGNAME;
        }

        return current_user;
    },

    /**
     * Render an app name if not existing.
     * @param {Object} conf
     */
    renderApplicationName: (conf) => {
        if (!conf.name && conf.script) {
            conf.name = conf.script !== undefined ? path.basename(conf.script) : "undefined";
            const lastDot = conf.name.lastIndexOf(".");
            if (lastDot > 0) {
                conf.name = conf.name.slice(0, lastDot);
            }
        }
    },
};

export default Common;

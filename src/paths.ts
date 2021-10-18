/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */

import debugLogger from "debug";
import path from "path";
import fs from "fs";

const debug = debugLogger("pm2:paths");

function getDefaultPM2Home() {
    let PM2_ROOT_PATH;

    if (process.env.PM2_HOME) {
        PM2_ROOT_PATH = process.env.PM2_HOME;
    } else if (process.env.HOME && !process.env.HOMEPATH) {
        PM2_ROOT_PATH = path.resolve(process.env.HOME, ".pm2t");
    } else if (process.env.HOME || process.env.HOMEPATH) {
        PM2_ROOT_PATH = path.resolve(process.env.HOMEDRIVE, process.env.HOME || process.env.HOMEPATH, ".pm2t");
    } else {
        console.error("[PM2][Initialization] Environment variable HOME (Linux) or HOMEPATH (Windows) are not set!");
        console.error("[PM2][Initialization] Defaulting to /etc/.pm2t");
        PM2_ROOT_PATH = path.resolve("/etc", ".pm2t");
    }

    debug("pm2 home resolved to %s", PM2_ROOT_PATH, process.env.HOME);
    return PM2_ROOT_PATH;
}

export default function (PM2_HOME) {
    let has_node_embedded = false;

    if (fs.existsSync(path.resolve(__dirname, "./node")) === true) {
        has_node_embedded = true;
    }

    if (!PM2_HOME) {
        PM2_HOME = getDefaultPM2Home();
    }

    const pm2_file_stucture = {
        PM2_HOME: PM2_HOME,
        PM2_ROOT_PATH: PM2_HOME,

        PM2_CONF_FILE: path.resolve(PM2_HOME, "conf.js"),
        PM2_MODULE_CONF_FILE: path.resolve(PM2_HOME, "module_conf.json"),

        PM2_LOG_FILE_PATH: path.resolve(PM2_HOME, "pm2t.log"),
        PM2_PID_FILE_PATH: path.resolve(PM2_HOME, "pm2t.pid"),

        PM2_RELOAD_LOCKFILE: path.resolve(PM2_HOME, "reload.lock"),

        DEFAULT_PID_PATH: path.resolve(PM2_HOME, "pids"),
        DEFAULT_LOG_PATH: path.resolve(PM2_HOME, "logs"),
        DEFAULT_MODULE_PATH: path.resolve(PM2_HOME, "modules"),
        PM2_IO_ACCESS_TOKEN: path.resolve(PM2_HOME, "pm2-io-token"),
        DUMP_FILE_PATH: path.resolve(PM2_HOME, "dump.pm2t"),
        DUMP_BACKUP_FILE_PATH: path.resolve(PM2_HOME, "dump.pm2t.bak"),

        DAEMON_RPC_PORT: path.resolve(PM2_HOME, "rpc.sock"),
        DAEMON_PUB_PORT: path.resolve(PM2_HOME, "pub.sock"),
        INTERACTOR_RPC_PORT: path.resolve(PM2_HOME, "interactor.sock"),

        INTERACTOR_LOG_FILE_PATH: path.resolve(PM2_HOME, "agent.log"),
        INTERACTOR_PID_PATH: path.resolve(PM2_HOME, "agent.pid"),
        INTERACTION_CONF: path.resolve(PM2_HOME, "agent.json5"),

        HAS_NODE_EMBEDDED: has_node_embedded,
        BUILTIN_NODE_PATH: has_node_embedded === true ? path.resolve(__dirname, "./node/bin/node") : null,
        BUILTIN_NPM_PATH: has_node_embedded === true ? path.resolve(__dirname, "./node/bin/npm") : null,
    };

    // allow overide of file paths via environnement
    const paths = Object.keys(pm2_file_stucture);
    paths.forEach(function (key) {
        const envKey = key.indexOf("PM2_") > -1 ? key : "PM2_" + key;
        if (process.env[envKey] && key !== "PM2_HOME" && key !== "PM2_ROOT_PATH") {
            pm2_file_stucture[key] = process.env[envKey];
        }
    });

    if (process.platform === "win32") {
        //@todo instead of static unique rpc/pub file custom with PM2_HOME or UID
        pm2_file_stucture.DAEMON_RPC_PORT = "\\\\.\\pipe\\rpc.sock";
        pm2_file_stucture.DAEMON_PUB_PORT = "\\\\.\\pipe\\pub.sock";
        pm2_file_stucture.INTERACTOR_RPC_PORT = "\\\\.\\pipe\\interactor.sock";
    }

    return pm2_file_stucture;
}

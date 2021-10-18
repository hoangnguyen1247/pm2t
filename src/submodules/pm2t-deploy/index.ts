import child_process from "child_process";
import { format } from "util";
import path from "path";
import series from "run-series";
import tv4 from "tv4";

const schema = {
    type: "object",
    properties: {
        user: { type: "string", minLength: 1 },
        host: { type: ["string", "array"] },
        repo: { type: "string" },
        ref: { type: "string" },
        path: { type: "string" },
        appFolderName: { type: "string" },
        fetch: { type: "string" },
    },
    required: ["host", "repo", "ref", "path", "appFolderName"],
};

/**
 * Spawn a modified version of visionmedia/deploy
 * @private
 * @param {object} config config to be piped to deploy
 * @param {array}  args custom deploy command-line arguments
 * @param {DeployCallback} cb done callback
 */
function spawn(config, args, cb) {
    let cmd = format("echo '%j' | \"%s\"", config, require.resolve("./deploy"));

    args = args || [];
    if (args.length > 0) {
        const cmdArgs = args.map(function (arg) {
            return format("\"%s\"", arg);
        }).join(" ");
        cmd = [cmd, cmdArgs].join(" ");
    }

    const proc = child_process.spawn("sh", ["-c", cmd], { stdio: "inherit" });
    let error;

    proc.on("error", function (err) {
        error = err;
    });

    proc.on("close", function (code) {
        if (code === 0) {
            return cb(null, args);
        }
        error = error || new Error(format("Deploy failed with exit code: %s", code));
        error.code = code;
        return cb(error);
    });
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function castArray(arg) {
    return Array.isArray(arg) ? arg : [arg];
}

/**
 * Deploy to a single environment
 * @param {object} deployConfig object containing deploy configs for all environments
 * @param {string} env the name of the environment to deploy to
 * @param {array} args custom deploy command-line arguments
 * @param {DeployCallback} cb done callback
 * @returns {boolean} return value is always `false`
 */
function deployForEnv(deployConfig, env, args, cb) {
    if (!deployConfig[env]) {
        return cb(new Error(format("%s not defined in deploy section", env)));
    }

    const envConfig = clone(deployConfig[env]);

    if (envConfig.ssh_options) {
        envConfig.ssh_options = castArray(envConfig.ssh_options).map(function (option) {
            return format("-o %s", option);
        }).join(" ");
    }

    const result = tv4.validateResult(envConfig, schema);
    if (!result.valid) {
        return cb(result.error);
    }

    if (process.env.NODE_ENV !== "test") {
        console.log("--> Deploying to %s environment", env);
    }

    if (process.platform !== "win32") {
        envConfig.path = path.resolve(envConfig.path);
    }

    const hosts = castArray(envConfig.host);
    const jobs = hosts.map(function (host) {
        return function job(done) {
            if (process.env.NODE_ENV !== "test") {
                console.log("--> on host %s", host.host ? host.host : host);
            }

            const config = clone(envConfig);
            config.host = host;
            config["post-deploy"] = prependEnv(config["post-deploy"], config.env);

            spawn(config, args, done);
        };
    });
    series(jobs, function (err, result) {
        result = Array.isArray(envConfig.host) ? result : result[0];
        cb(err, result);
    });

    return false;
}

function envToString(env) {
    env = env || {};
    return Object.keys(env).map(function (name) {
        return format("%s=%s", name.toUpperCase(), env[name]);
    }).join(" ");
}

/**
 * Prepend command with environment variables
 * @private
 * @param {string} cmd command
 * @param {object} env object containing environment variables
 * @returns {string} concatenated shell command
 */
function prependEnv(cmd, env) {
    const envVars = envToString(env);
    if (!envVars) {
        return cmd;
    }
    if (!cmd) {
        return format("export %s", envVars);
    }
    return format("export %s && %s", envVars, cmd);
}

export default {
    deployForEnv,
};

const fs = require("fs-extra");
const copyDir = require("copy-dir");
const defaultOption = {
    utimes: true,
    mode: true,
    cover: true,
};

const copyDirSync = (srcFolders, rootSrc, rootDest, option = {}) => {
    srcFolders.forEach(folder => {
        copyDir.sync(`${rootSrc}/${folder}`, `${rootDest}/${folder}`, {
            ...defaultOption,
            ...option,
        });
    });
};

const snapCoreFolders = [""];

fs.ensureDirSync("./lib");
copyDirSync(
    snapCoreFolders,
    "./src/API/pm2-plus/pres",
    "./lib/API/pm2-plus/pres",
    {
        filter: function(stat, filepath, filename) {
            // do not want copy .git directories
            if (stat === "directory" && filename === "node_modules") {
                return false;
            }

            if (stat === "directory" && filename === ".git") {
                return false;
            }

            if (filename === "yarn.lock") {
                return false;
            }

            if (stat === "directory" && filename === "examples") {
                return false;
            }

            if (stat === "directory" && filename === "dist") {
                return false;
            }

            if (stat === "directory" && filename === "lib") {
                return false;
            }

            return true; // remind to return a true value when file check passed.
        },
    }
);

fs.ensureDirSync("./lib");
copyDirSync(
    snapCoreFolders,
    "./src/motd",
    "./lib/motd",
    {
        filter: function(stat, filepath, filename) {
            // do not want copy .git directories
            if (stat === "directory" && filename === "node_modules") {
                return false;
            }

            if (stat === "directory" && filename === ".git") {
                return false;
            }

            if (filename === "yarn.lock") {
                return false;
            }

            if (stat === "directory" && filename === "examples") {
                return false;
            }

            if (stat === "directory" && filename === "dist") {
                return false;
            }

            if (stat === "directory" && filename === "lib") {
                return false;
            }

            return true; // remind to return a true value when file check passed.
        },
    }
);

// const snapDomFolders = ['assets', 'components', 'utils'];
// copyDirSync(
//   snapDomFolders,
//   './assets',
//   './dist/assets'
// );

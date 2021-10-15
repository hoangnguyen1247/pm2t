const fs = require("fs-extra");

function bumpVersion(newVersion) {
    const pkg = require("../package.json");

    // If standalone build required from Phoenix for Widgets and Components
    if (newVersion) {
        pkg["version"] = newVersion;
    }

    // Prepare the package.json for release
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, 4));
}

var myArgs = process.argv.slice(2);
// console.log("myArgs: ", myArgs);

const version = myArgs[0];
bumpVersion(version);

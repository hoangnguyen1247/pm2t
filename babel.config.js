module.exports = {
    "ignore": [
        "node_modules",
        "build"
    ],
    "presets": [
        "@babel/preset-env",
        "@babel/preset-typescript"
    ],
    "plugins": [
        "@babel/proposal-class-properties",
        "@babel/proposal-object-rest-spread",
        ["module-resolver", {
            "root": ["."],
            "extensions": [
                ".js",
                ".ts",
                ".tsx",
                ".json"
            ],
            "alias": {
                "src": ["./src/"],
                "server": ["./server/"]
            }
        }],
        "@babel/plugin-transform-runtime",
    ],
    "sourceMaps": false
}

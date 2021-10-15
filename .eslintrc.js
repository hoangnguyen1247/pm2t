module.exports = {
    "parser": "@typescript-eslint/parser",
    "plugins": ["@typescript-eslint"],
    "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    "env": {
        "es6": true,
        "browser": true,
        "mocha": true,
        "node": true,
    },
    "rules": {
        "@typescript-eslint/no-empty-function": 0,
        "@typescript-eslint/explicit-function-return-type": 0,
        "@typescript-eslint/explicit-member-accessibility": 0,
        "@typescript-eslint/member-delimiter-style": 0,
        "@typescript-eslint/no-explicit-any": 0,
        "@typescript-eslint/no-var-requires": 0,
        "@typescript-eslint/no-use-before-define": 0,
        "@typescript-eslint/no-unused-vars": [ 2, { "args": "none" } ],
        "@typescript-eslint/explicit-module-boundary-types": 0,
        "@typescript-eslint/no-empty-interface": 0,
        "@typescript-eslint/indent": [2, 4],
        "@typescript-eslint/quotes": [2, "double"],
        "@typescript-eslint/semi": [2, "always"],
        "no-prototype-builtins": 0,
        "object-curly-spacing": [ 2, "always" ],
        "eol-last": [ 2, "always" ],
        "curly": [2, "all"],
        "brace-style": [ 2, "1tbs" ],
        "no-empty": 0,
        "no-empty-function": [ 2, { "allow": [ "functions", "methods", "arrowFunctions" ] }],
        "no-console": 0,
        "no-control-regex": 0,
        "no-useless-escape": 0,
        "no-octal": 0,
    }
};
/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */
import util from "util";
import schema from "../API/schema";

/**
 * Validator of configured file / commander options.
 */
const Config = {
    _errMsgs: {
        "require": "\"%s\" is required",
        "type": "Expect \"%s\" to be a typeof %s, but now is %s",
        "regex": "Verify \"%s\" with regex failed, %s",
        "max": "The maximum of \"%s\" is %s, but now is %s",
        "min": "The minimum of \"%s\" is %s, but now is %s"
    },

    _errors: [],

    /**
     * Schema definition.
     * @returns {exports|*}
     */
    get schema() {
        // Cache.
        if (this._schema) {
            return this._schema;
        }
        // Render aliases.
        this._schema = schema;
        for (const k in this._schema) {
            if (k.indexOf("\\") > 0) {
                continue;
            }
            const aliases = [
                k.split("_").map(function (n, i) {
                    if (i != 0 && n && n.length > 1) {
                        return n[0].toUpperCase() + n.slice(1);
                    }
                    return n;
                }).join("")
            ];

            if (this._schema[k].alias && Array.isArray(this._schema[k].alias)) {
                // If multiple aliases, merge
                this._schema[k].alias.forEach(function (alias) {
                    aliases.splice(0, 0, alias);
                });
            } else if (this._schema[k].alias) {
                aliases.splice(0, 0, this._schema[k].alias);
            }

            this._schema[k].alias = aliases;
        }
        return this._schema;
    },

    /**
     * Filter / Alias options
     */
    filterOptions: function (cmd) {
        const conf = {};
        const schema = this.schema;

        for (const key in schema) {
            const aliases = schema[key].alias;
            aliases && aliases.forEach(function (alias) {
                if (typeof (cmd[alias]) !== "undefined") {
                    conf[key] || (conf[key] = cmd[alias]);
                }
            });
        }

        return conf;
    },

    /**
     * Verify JSON configurations.
     * @param {Object} json
     * @returns {{errors: Array, config: {}}}
     */
    validateJSON: function (json) {
        // clone config
        const conf: any = Object.assign({}, json);
        const res = {};
        this._errors = [];

        const regexKeys = {}, defines = this.schema;

        for (const sk in defines) {
            // Pick up RegExp keys.
            if (sk.indexOf("\\") >= 0) {
                regexKeys[sk] = false;
                continue;
            }

            const aliases = defines[sk].alias;

            aliases && aliases.forEach(function (alias) {
                conf[sk] || (conf[sk] = json[alias]);
            });

            let val = conf[sk];
            delete conf[sk];

            // Validate key-value pairs.
            if (val === undefined ||
                val === null ||
                ((val = this._valid(sk, val)) === null)) {

                // If value is not defined
                // Set default value (via schema.json)
                if (typeof (defines[sk].default) !== "undefined") {
                    res[sk] = defines[sk].default;
                }
                continue;
            }
            //console.log(sk, val, val === null, val === undefined);
            res[sk] = val;
        }

        // Validate RegExp values.
        let hasRegexKey = false;
        for (const k in regexKeys) {
            hasRegexKey = true;
            regexKeys[k] = new RegExp(k);
        }
        if (hasRegexKey) {
            for (const k in conf) {
                for (const rk in regexKeys) {
                    if (regexKeys[rk].test(k)) {
                        if (this._valid(k, conf[k], defines[rk])) {
                            res[k] = conf[k];
                            delete conf[k];
                        }
                    }
                }
            }
        }

        return { errors: this._errors, config: res };
    },

    /**
     * Validate key-value pairs by specific schema
     * @param {String} key
     * @param {Mixed} value
     * @param {Object} sch
     * @returns {*}
     * @private
     */
    _valid: function (key, value, sch) {
        // console.log("Config", "key", key);
        // const _sch = sch || this.schema[key],
        //     scht = typeof _sch.type == "string" ? [_sch.type] : _sch.type;

        // // Required value.
        // const undef = typeof value == "undefined";
        // if (this._error(_sch.require && undef, "require", key)) {
        //     return null;
        // }

        // // If undefined, make a break.
        // if (undef) {
        //     return null;
        // }

        // console.log(JSON.stringify(_sch, null, 4));
        // // Wrap schema types.
        // const __scht = Object.entries(_sch).map(function (t) {
        //     return "[object " + t[0].toUpperCase() + t.slice(1) + "]";
        // });

        // // Typeof value.
        // let type = Object.prototype.toString.call(value);
        // const nt = "[object Number]";

        // // Auto parse Number
        // if (type != "[object Boolean]" && __scht.indexOf(nt) >= 0 && !isNaN(value)) {
        //     value = parseFloat(value);
        //     type = nt;
        // }

        // // Verify types.
        // if (this._error(!~__scht.indexOf(type), "type", key, __scht.join(" / "), type)) {
        //     return null;
        // }

        // // Verify RegExp if exists.
        // if (this._error(type == "[object String]" && __scht.regex && !(new RegExp(__scht.regex)).test(value),
        //     "regex", key, __scht.desc || ("should match " + __scht.regex))) {
        //     return null;
        // }

        // // Verify maximum / minimum of Number value.
        // if (type == "[object Number]") {
        //     if (this._error(typeof __scht.max != "undefined" && value > __scht.max, "max", key, __scht.max, value)) {
        //         return null;
        //     }
        //     if (this._error(typeof __scht.min != "undefined" && value < __scht.min, "min", key, __scht.min, value)) {
        //         return null;
        //     }
        // }

        // // If first type is Array, but current is String, try to split them.
        // if (scht.length > 1 && type != scht[0] && type == "[object String]") {
        //     if (scht[0] == "[object Array]") {
        //         // unfortunately, js does not support lookahead RegExp (/(?<!\\)\s+/) now (until next ver).
        //         // eslint-disable-next-line no-useless-escape
        //         value = value.split(/([\w\-]+\="[^"]*")|([\w\-]+\='[^']*')|"([^"]*)"|'([^']*)'|\s/)
        //             .filter(function (v) {
        //                 return v && v.trim();
        //             });
        //     }
        // }

        // // Custom types: sbyte && stime.
        // if (__scht.ext_type && type == "[object String]" && value.length >= 2) {
        //     const seed = {
        //         "sbyte": {
        //             "G": 1024 * 1024 * 1024,
        //             "M": 1024 * 1024,
        //             "K": 1024
        //         },
        //         "stime": {
        //             "h": 60 * 60 * 1000,
        //             "m": 60 * 1000,
        //             "s": 1000
        //         }
        //     }[__scht.ext_type];

        //     if (seed) {
        //         value = parseFloat(value.slice(0, -1)) * (seed[value.slice(-1)]);
        //     }
        // }
        // return value;
        return true;
    },

    /**
     * Wrap errors.
     * @param {Boolean} possible A value indicates whether it is an error or not.
     * @param {String} type
     * @returns {*}
     * @private
     */
    _error: function (...args) {
        const [ possible, type ] = args;

        if (possible) {
            args.splice(0, 2, this._errMsgs[type]);
            this._errors && this._errors.push(util.format.apply(null, args as any));
        }
        return possible;
    },
};

export default Config;

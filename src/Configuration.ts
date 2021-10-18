/**
 * Copyright 2013 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */
import fs from "fs";

import Common from "./Common";
import eachSeries from "async/eachSeries";
import cst from "./constants";

function splitKey(key) {
    let values = [key];

    if (key.indexOf(".") > -1) {
        values = key.match(/(?:[^."]+|"[^"]*")+/g).map(function (dt) {
            return dt.replace(/"/g, "");
        });
    } else if (key.indexOf(":") > -1) {
        values = key.match(/(?:[^:"]+|"[^"]*")+/g).map(function (dt) {
            return dt.replace(/"/g, "");
        });
    }

    return values;
}

function serializeConfiguration(json_conf) {
    return JSON.stringify(json_conf, null, 4);
}

const Configuration = {
    set: function (key, value, cb) {
        fs.readFile(cst.PM2_MODULE_CONF_FILE, "utf8", function (err, data) {
            if (err) {
                return cb(err);
            }

            const json_conf = JSON.parse(data);

            const values = splitKey(key);

            if (values.length > 0) {
                const levels = values;

                let tmp = json_conf;

                levels.forEach(function (key, index) {
                    if (index == levels.length - 1) {
                        tmp[key] = value;
                    } else if (!tmp[key]) {
                        tmp[key] = {};
                        tmp = tmp[key];
                    } else {
                        if (typeof (tmp[key]) != "object") {
                            tmp[key] = {};
                        }
                        tmp = tmp[key];
                    }
                });

            } else {
                if (json_conf[key] && typeof (json_conf[key]) === "string") {
                    Common.printOut(cst.PREFIX_MSG + "Replacing current value key %s by %s", key, value);
                }

                json_conf[key] = value;
            }

            fs.writeFile(cst.PM2_MODULE_CONF_FILE, serializeConfiguration(json_conf), function (err) {
                if (err) {
                    return cb(err);
                }

                return cb(null, json_conf);
            });
            return false;
        });
    },

    unset: function (key, cb) {
        fs.readFile(cst.PM2_MODULE_CONF_FILE, "utf8", function (err, data) {
            if (err) {
                return cb(err);
            }

            let json_conf = JSON.parse(data);

            const values = splitKey(key);

            if (values.length > 0) {
                const levels = values;

                let tmp = json_conf;

                levels.forEach(function (key, index) {
                    if (index == levels.length - 1) {
                        delete tmp[key];
                    } else if (!tmp[key]) {
                        tmp[key] = {};
                        tmp = tmp[key];
                    } else {
                        if (typeof (tmp[key]) != "object") {
                            tmp[key] = {};
                        }
                        tmp = tmp[key];
                    }
                });

            } else {
                delete json_conf[key];
            }

            if (err) {
                return cb(err);
            }

            if (key === "all") {
                json_conf = {};
            }

            fs.writeFile(cst.PM2_MODULE_CONF_FILE, serializeConfiguration(json_conf), function (err) {
                if (err) {
                    return cb(err);
                }

                return cb(null, json_conf);
            });
            return false;
        });
    },

    setSyncIfNotExist: function (key, value) {
        let conf = null;
        try {
            conf = JSON.parse(fs.readFileSync(cst.PM2_MODULE_CONF_FILE, "utf8"));
        } catch (e) {
            return null;
        }

        const values = splitKey(key);
        let exists = false;

        if (values.length > 1 && conf && conf[values[0]]) {
            exists = Object.keys(conf[values[0]]).some(function (key) {
                if (key == values[1]) {
                    return true;
                }
                return false;
            });
        }

        if (exists === false) {
            return Configuration.setSync(key, value);
        }

        return null;
    },

    setSync: function (key, value) {
        let data = null;
        try {
            data = fs.readFileSync(cst.PM2_MODULE_CONF_FILE, "utf8");
        } catch (e) {
            return null;
        }

        let json_conf = JSON.parse(data);

        const values = splitKey(key);

        if (values.length > 0) {
            const levels = values;

            let tmp = json_conf;

            levels.forEach(function (key, index) {
                if (index == levels.length - 1) {
                    tmp[key] = value;
                } else if (!tmp[key]) {
                    tmp[key] = {};
                    tmp = tmp[key];
                } else {
                    if (typeof (tmp[key]) != "object") {
                        tmp[key] = {};
                    }
                    tmp = tmp[key];
                }
            });

        } else {
            if (json_conf[key] && typeof (json_conf[key]) === "string") {
                Common.printOut(cst.PREFIX_MSG + "Replacing current value key %s by %s", key, value);
            }

            json_conf[key] = value;
        }

        if (key === "all") {
            json_conf = {};
        }

        try {
            fs.writeFileSync(cst.PM2_MODULE_CONF_FILE, serializeConfiguration(json_conf));
            return json_conf;
        } catch (e: any) {
            console.error(e.message);
            return null;
        }
    },

    unsetSync: function (key) {
        let data = null;
        try {
            data = fs.readFileSync(cst.PM2_MODULE_CONF_FILE, "utf8");
        } catch (e) {
            return null;
        }

        let json_conf = JSON.parse(data);

        const values = splitKey(key);

        if (values.length > 0) {
            const levels = values;

            let tmp = json_conf;

            levels.forEach(function (key, index) {
                if (index == levels.length - 1) {
                    delete tmp[key];
                } else if (!tmp[key]) {
                    tmp[key] = {};
                    tmp = tmp[key];
                } else {
                    if (typeof (tmp[key]) != "object") {
                        tmp[key] = {};
                    }
                    tmp = tmp[key];
                }
            });

        } else {
            delete json_conf[key];
        }

        if (key === "all") {
            json_conf = {};
        }

        try {
            fs.writeFileSync(cst.PM2_MODULE_CONF_FILE, serializeConfiguration(json_conf));
        } catch (e: any) {
            console.error(e.message);
            return null;
        }
    },

    multiset: function (serial, cb) {
        const arrays = [];
        serial = serial.match(/(?:[^ "]+|"[^"]*")+/g);

        while (serial.length > 0) {
            arrays.push(serial.splice(0, 2));
        }

        eachSeries(arrays, function (el, next) {
            Configuration.set(el[0], el[1], next);
        }, cb);
    },

    get: function (key, cb) {
        Configuration.getAll(function (err, data) {
            const climb = splitKey(key);

            climb.some(function (val) {
                if (!data[val]) {
                    data = null;
                    return true;
                }
                data = data[val];
                return false;
            });

            if (!data) {
                return cb({ err: "Unknown key" }, null);
            }
            return cb(null, data);
        });
    },

    getSync: function (key) {
        let data = null;
        try {
            data = Configuration.getAllSync();
        } catch (e) {
            return null;
        }

        const climb = splitKey(key);

        climb.some(function (val) {
            if (!data[val]) {
                data = null;
                return true;
            }
            data = data[val];
            return false;
        });

        if (!data) {
            return null;
        }
        return data;
    },

    getAll: function (cb) {
        fs.readFile(cst.PM2_MODULE_CONF_FILE, "utf8", function (err, data) {
            if (err) {
                return cb(err);
            }
            return cb(null, JSON.parse(data));
        });
    },

    getAllSync: function () {
        try {
            return JSON.parse(fs.readFileSync(cst.PM2_MODULE_CONF_FILE, "utf8"));
        } catch (e: any) {
            console.error(e.stack || e);
            return {};
        }
    },
};

export default Configuration;

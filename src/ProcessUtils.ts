'use strict'

import pmx from 'pm2t-io-apm';

export default {
    injectModules: function () {
        if (process.env.pmx !== 'false') {
            let conf = {}
            const hasSpecificConfig = typeof process.env.io === 'string' || process.env.trace === 'true'
            // pmx is already init, no need to do it twice
            if (hasSpecificConfig === false) return

            if (process.env.io) {
                const io = JSON.parse(process.env.io)
                conf = io.conf ? io.conf : conf
            }
            pmx.init(Object.assign({
                tracing: process.env.trace === 'true' || false
            }, conf))
        }
    },
    isESModule(exec_path) {
        var fs = require('fs')
        var path = require('path')
        var semver = require('semver')
        var data

        if (semver.satisfies(process.version, '< 13.3.0'))
            return false

        if (path.extname(exec_path) === '.mjs')
            return true

        try {
            data = JSON.parse(fs.readFileSync(path.join(path.dirname(exec_path), 'package.json')))
            if (data.type === 'module')
                return true
            else
                return false
        } catch (e) {
        }

        try {
            data = JSON.parse(fs.readFileSync(path.join(path.dirname(exec_path), '..', 'package.json')))
            if (data.type === 'module')
                return true
            else
                return false
        } catch (e) {
            return false
        }
    }
}

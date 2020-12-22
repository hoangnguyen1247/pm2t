import fs from 'fs';
import chalk from 'chalk';
import KMDaemon from 'pm2t-io-agent';

import cst from '../../constants';
import Common from '../../Common';
import pkg from '../../../package.json';

export default function (CLI) {

    CLI.prototype.linkManagement = function (cmd, public_key, machine, opts, cb) {
        var that = this;

        // pm2 link stop || kill
        if (cmd == 'stop' || cmd == 'kill') {
            that.gl_is_km_linked = false
            console.log(cst.PM2_IO_MSG + ' Stopping agent...');

            return that.killAgent(function (err) {
                if (err) {
                    Common.printError(err);
                    return process.exit(cst.ERROR_EXIT);
                }
                console.log(cst.PM2_IO_MSG + ' Stopped');

                that.reload('all', () => {
                    return process.exit(cst.SUCCESS_EXIT);
                })
            });
        }

        // pm2 link info
        if (cmd == 'info') {
            console.log(cst.PM2_IO_MSG + ' Getting agent information...');
            that.agentInfos(function (err, infos) {
                if (err) {
                    console.error(cst.PM2_IO_MSG_ERR + ' ' + err.message);
                    return that.exitCli(cst.ERROR_EXIT);
                }
                console.log(infos);
                return that.exitCli(cst.SUCCESS_EXIT);
            });
            return false;
        }

        // pm2 link delete
        if (cmd == 'delete') {
            that.gl_is_km_linked = false
            console.log(cst.PM2_IO_MSG + ' Permanently disable agent...');
            that.killAgent(function (err) {
                try {
                    fs.unlinkSync(cst.INTERACTION_CONF);
                } catch (e) {
                    console.log(cst.PM2_IO_MSG + ' No interaction config file found');
                    return process.exit(cst.SUCCESS_EXIT);
                }
                console.log(cst.PM2_IO_MSG + ' Agent interaction ended');
                if (!cb)
                    return process.exit(cst.SUCCESS_EXIT);
                return cb()
            });
            return false;
        }

        if (cmd && !public_key) {
            console.error(cst.PM2_IO_MSG + ' Command [%s] unknown or missing public key', cmd);
            return process.exit(cst.ERROR_EXIT);
        }

        // pm2 link xxx yyy
        var infos;

        if (!cmd) {
            infos = null;
        }
        else
            infos = {
                public_key: public_key,
                secret_key: cmd,
                machine_name: machine,
                info_node: opts.infoNode || null,
                pm2_version: pkg.version
            }

        if (opts && opts.axon === true && infos) {
            infos.agent_transport_axon = true
            infos.agent_transport_websocket = false
            process.env.AGENT_TRANSPORT_AXON = "true"
            process.env.AGENT_TRANSPORT_WEBSOCKET = "false"
        }
        else if (infos) {
            infos.agent_transport_axon = false
            infos.agent_transport_websocket = true
            process.env.AGENT_TRANSPORT_AXON = "false"
            process.env.AGENT_TRANSPORT_WEBSOCKET = "true"
        }

        that.link(infos, cb)
    };

    CLI.prototype.link = function (infos, cb) {
        var that = this;

        if (infos && !infos.machine_name)
            infos.machine_name = require('os').hostname() + '-' + require('crypto').randomBytes(2).toString('hex')

        KMDaemon.launchAndInteract(cst, infos, function (err, dt) {
            if (err) {
                Common.printError(cst.PM2_IO_MSG + ' Run `$ pm2 plus` to connect')
                return that.exitCli(cst.ERROR_EXIT);
            }
            console.log(chalk.bold.green('[+] PM2+ activated!'))
            if (!cb) {
                return that.exitCli(cst.SUCCESS_EXIT);
            }
            return cb(null, dt)
        });
    };

    CLI.prototype.agentInfos = function (cb) {
        KMDaemon.getInteractInfo(this._conf, function (err, data) {
            if (err)
                return cb(Common.retErr(err));
            return cb(null, data);
        });
    };

    CLI.prototype.killAgent = function (cb) {
        var that = this;
        KMDaemon.killInteractorDaemon(that._conf, function (err) {
            if (err)
                return cb ? cb(Common.retErr(err)) : that.exitCli(cst.SUCCESS_EXIT);
            return cb ? cb(null) : that.exitCli(cst.SUCCESS_EXIT);
        });
    };

    CLI.prototype.unlink = function (cb) {
        this.linkManagement('delete', cb);
    };
};

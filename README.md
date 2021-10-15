<div align="center">
A Typescript version of PM2 4.5.0
<br/><b>P</b>(rocess) <b>M</b>(anager) <b>2</b><br/>
  <i>Runtime Edition</i>
<br/>
  <b>Don't use for your production app. Use PM2 instead</b>
<br/><br/>

<a href="https://npm-stat.com/charts.html?package=pm2t&from=2015-10-09&to=2020-10-09" title="PM2 Downloads">
  <img src="https://img.shields.io/npm/dm/pm2" alt="Downloads per Month"/>
</a>

<a href="https://badge.fury.io/js/pm2" title="NPM Version Badge">
   <img src="https://badge.fury.io/js/pm2.svg" alt="npm version">
</a>

<a href="https://img.shields.io/node/v/pm2.svg" title="Node Limitation">
   <img src="https://img.shields.io/node/v/pm2.svg" alt="node version">
</a>

<a href="https://travis-ci.org/Unitech/pm2" title="PM2 Tests">
  <img src="https://travis-ci.org/Unitech/pm2.svg?branch=master" alt="Build Status"/>
</a>

<br/>
<br/>
<br/>
</div>


A process manager for Node.js applications.

Starting an application in production mode is as easy as:

```bash
$ pm2t start app.js
```

Works on Linux (stable) & macOS (stable) & Windows (stable). All Node.js versions are supported starting Node.js 8.X.


### Installing PM2t

With NPM:

```bash
$ npm install pm2t -g
```

### Start an application

You can start any application (Node.js, Python, Ruby, binaries in $PATH...) like that:

```bash
$ pm2t start app.js
```

Your app is now daemonized, monitored and kept alive forever.

### Managing Applications

Once applications are started you can manage them easily:

![Process listing](https://github.com/unitech/pm2/raw/master/pres/pm2-list.png)

To list all running applications:

```bash
$ pm2t list
```

Managing apps is straightforward:

```bash
$ pm2t stop     <app_name|namespace|id|'all'|json_conf>
$ pm2t restart  <app_name|namespace|id|'all'|json_conf>
$ pm2t delete   <app_name|namespace|id|'all'|json_conf>
```

To have more details on a specific application:

```bash
$ pm2t describe <id|app_name>
```

To monitor logs, custom metrics, application information:

```bash
$ pm2t monit
```


[More about Process Management](https://pm2.keymetrics.io/docs/usage/process-management/)

### Cluster Mode: Node.js Load Balancing & Zero Downtime Reload

The Cluster mode is a special mode when starting a Node.js application, it starts multiple processes and load-balance HTTP/TCP/UDP queries between them. This increase overall performance (by a factor of x10 on 16 cores machines) and reliability (faster socket re-balancing in case of unhandled errors).

Starting a Node.js application in cluster mode that will leverage all CPUs available:

```bash
$ pm2t start api.js -i <processes>
```

`<processes>` can be `'max'`, `-1` (all cpu minus 1) or a specified number of instances to start.

**Zero Downtime Reload**

Hot Reload allows to update an application without any downtime:

```bash
$ pm2t reload all
```

[More informations about how PM2 make clustering easy](https://pm2.keymetrics.io/docs/usage/cluster-mode/)

### Container Support

With the drop-in replacement command for `node`, called `pm2-runtime`, run your Node.js application in a hardened production environment.
Using it is seamless:

```
RUN npm install pm2 -g
CMD [ "pm2-runtime", "npm", "--", "start" ]
```

[Read More about the dedicated integration](https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/)

### Terminal Based Monitoring

![Monit](https://github.com/Unitech/pm2/raw/master/pres/pm2-monit.png)

Monitor all processes launched straight from the command line:

```bash
$ pm2t monit
```

### Log Management

To consult logs just type the command:

```bash
$ pm2t logs
```

Standard, Raw, JSON and formated output are available.

Examples:

```bash
$ pm2t logs APP-NAME       # Display APP-NAME logs
$ pm2t logs --json         # JSON output
$ pm2t logs --format       # Formated output

$ pm2t flush               # Flush all logs
$ pm2t reloadLogs          # Reload all logs
```

[More about log management](https://pm2.keymetrics.io/docs/usage/log-management/)

### Startup Scripts Generation

PM2 can generates and configure a Startup Script to keep PM2 and your processes alive at every server restart.

Init Systems Supported: **systemd**, **upstart**, **launchd**, **rc.d**

```bash
# Generate Startup Script
$ pm2t startup

# Freeze your process list across server restart
$ pm2t save

# Remove Startup Script
$ pm2t unstartup
```

[More about Startup Scripts Generation](https://pm2.keymetrics.io/docs/usage/startup/)

### PM2 Modules

PM2 embeds a simple and powerful module system. Installing a module is straightforward:

```bash
$ pm2t install <module_name>
```

Here are some PM2 compatible modules (standalone Node.js applications managed by PM2):

[**pm2-logrotate**](https://www.npmjs.com/package/pm2-logrotate) automatically rotate logs and limit logs size<br/>
[**pm2-server-monit**](https://www.npmjs.com/package/pm2-server-monit) monitor the current server with more than 20+ metrics and 8 actions<br/>

### Updating PM2

```bash
# Install latest PM2 version
$ npm install pm2t@latest -g
# Save process list, exit old PM2 & restore all processes
$ pm2t update
```

## Contributors

## License


import os from "os";
import fs from "fs";
import debugLogger from "debug";
import async from "async";
import sysinfo from "systeminformation";
import { fork } from "child_process";

import psList from "./psList";
import MeanCalc from "./MeanCalc";

const debug = debugLogger("pm2:sysinfos");

const DEFAULT_CONVERSION = 1024 * 1024;

class SystemInfo {
    infos: any;
    ping_timeout: NodeJS.Timeout;
    restart: boolean;
    process: any;

    constructor() {
        this.infos = {
            baseboard: {
                model: null,
                version: null
            },
            cpu: {
                manufacturer: null,
                brand: null,
                speedmax: null,
                cores: null,
                physicalCores: null,
                processors: null,
                temperature: null,
                usage: null
            },
            mem: {
                total: null,
                free: null,
                active: null
            },
            os: {
                platform: null,
                distro: null,
                release: null,
                codename: null,
                kernel: null,
                arch: null,
            },
            fd: {
                opened: null,
                max: null
            },
            storage: {
                io: {
                    read: new MeanCalc(15),
                    write: new MeanCalc(15)
                },
                physical_disks: [{
                    device: null,
                    type: null,
                    name: null,
                    interfaceType: null,
                    vendor: null
                }],
                filesystems: [{
                }]
            },
            connections: ["source_ip:source_port-dest_ip:dest_port-proc_name"],
            network: {
                latency: new MeanCalc(5),
                tx_5: new MeanCalc(5),
                rx_5: new MeanCalc(5),
                rx_errors_60: new MeanCalc(60),
                tx_errors_60: new MeanCalc(60),
                tx_dropped_60: new MeanCalc(60),
                rx_dropped_60: new MeanCalc(60)
            },
            // Procs
            containers: [],
            processes: {
                cpu_sorted: null,
                mem_sorted: null
            },
            services: {
                running: null,
                stopped: null
            }
        };
        this.restart = true;
        this.ping_timeout = null;
    }

    // Cast MeanCalc and other object to real value
    // This method retrieve the machine snapshot well formated
    report() {
        const report = JSON.parse(JSON.stringify(this.infos));
        report.network.latency = this.infos.network.latency.val();
        report.network.tx_5 = this.infos.network.tx_5.val();
        report.network.rx_5 = this.infos.network.rx_5.val();
        report.network.rx_errors_60 = this.infos.network.rx_errors_60.val();
        report.network.tx_errors_60 = this.infos.network.tx_errors_60.val();
        report.network.rx_dropped_60 = this.infos.network.rx_dropped_60.val();
        report.network.tx_dropped_60 = this.infos.network.tx_dropped_60.val();
        report.storage.io.read = this.infos.storage.io.read.val();
        report.storage.io.write = this.infos.storage.io.write.val();
        return report;
    }

    fork() {
        this.process = fork(__filename, {
            detached: false,
            windowsHide: true,
            stdio: ["inherit", "inherit", "inherit", "ipc"]
        } as any);

        this.process.on("exit", (code) => {
            console.log(`systeminfos collection process offline with code ${code}`);
            // if (this.restart == true)
            //   this.fork()
        });

        this.process.on("error", (e) => {
            console.log("Sysinfo errored", e);
        });

        this.process.on("message", (msg) => {
            try {
                msg = JSON.parse(msg);
            } catch (e) {
                // do nothing
            }

            if (msg.cmd == "ping") {
                if (this.process.connected == true) {
                    try {
                        this.process.send("pong");
                    } catch (e) {
                        console.error("Cannot send message to Sysinfos");
                    }
                }
            }
        });
    }

    query(cb) {
        if (this.process.connected == true) {
            try {
                this.process.send("query");
            } catch (e) {
                return cb(new Error("not ready yet"), null);
            }
        } else {
            return cb(new Error("not ready yet"), null);
        }

        const res = (msg) => {
            try {
                msg = JSON.parse(msg);
            } catch (e) {
                // do nothing
            }

            if (msg.cmd == "query:res") {
                listener.removeListener("message", res);
                return cb(null, msg.data);
            }
        };

        const listener = this.process.on("message", res);
    }

    kill() {
        this.restart = false;
        this.process.kill();
    }

    startCollection() {
        this.staticInformations();

        let dockerCollection, processCollection, memCollection;
        // let servicesCollection;

        (dockerCollection = () => {
            this.dockerSummary(() => {
                setTimeout(dockerCollection.bind(this), 300);
            });
        })();

        (processCollection = () => {
            this.processesSummary(() => {
                setTimeout(processCollection.bind(this), 5000);
            });
        })();

        // (servicesCollection = () => {
        //   this.servicesSummary(() => {
        //     setTimeout(servicesCollection.bind(this), 60000)
        //   })
        // })();

        (memCollection = () => {
            this.memStats(() => {
                setTimeout(memCollection.bind(this), 1000);
            });
        })();

        this.networkConnectionsWorker();
        this.disksStatsWorker();
        this.networkStatsWorker();

        this.cpuStatsWorker();
        this.fdStatsWorker();

        setInterval(() => {
            if (process.connected == false) {
                console.error("Sysinfos not connected, exiting");
                process.exit();
            }
            try {
                process.send(JSON.stringify({ cmd: "ping" }));
            } catch (e) {
                console.error("PM2 is dead while doing process.send");
                process.exit();
            }
            this.ping_timeout = setTimeout(() => {
                console.error("PM2 is dead while waiting for a pong");
                process.exit();
            }, 2000);
        }, 3000);

        // Systeminfo receive command
        process.on("message", (cmd) => {
            if (cmd == "query") {
                try {
                    const res = JSON.stringify({
                        cmd: "query:res",
                        data: this.report()
                    });
                    process.send(res);
                } catch (e) {
                    console.error("Could not retrieve system informations", e);
                }
            } else if (cmd == "pong") {
                clearTimeout(this.ping_timeout);
            }
        });

    }

    staticInformations() {
        const getCPU = () => {
            return sysinfo.cpu()
                .then(data => {
                    this.infos.cpu = {
                        brand: data.manufacturer,
                        model: data.brand,
                        speed: data.speedmax,
                        cores: data.cores,
                        physicalCores: data.physicalCores
                    };
                });
        };

        const getBaseboard = () => {
            return sysinfo.system()
                .then(data => {
                    this.infos.baseboard = {
                        manufacturer: data.manufacturer,
                        model: data.model,
                        version: data.version
                    };
                });
        };

        const getOsInfo = () => {
            return sysinfo.osInfo()
                .then(data => {
                    this.infos.os = {
                        platform: data.platform,
                        distro: data.distro,
                        release: data.release,
                        codename: data.codename,
                        kernel: data.kernel,
                        arch: data.arch
                    };
                });
        };

        const diskLayout = () => {
            this.infos.storage.physical_disks = [];

            return sysinfo.diskLayout()
                .then(disks => {
                    disks.forEach((disk) => {
                        this.infos.storage.physical_disks.push({
                            device: disk.device,
                            type: disk.type,
                            name: disk.name,
                            interfaceType: disk.interfaceType,
                            vendor: disk.vendor
                        });
                    });
                });
        };

        getBaseboard()
            .then(getCPU)
            .then(getOsInfo)
            .then(diskLayout)
            .catch(e => {
                debug("Error when trying to retrieve static informations", e);
            });
    }

    dockerSummary(cb) {
        sysinfo.dockerContainers(true)
            .then(containers => {
                const non_exited_containers = containers.filter(container => container.state != "exited");
                const new_containers = [];

                async.forEach(non_exited_containers, (container, next) => {
                    sysinfo.dockerContainerStats(container.id)
                        .then((stats: any[]) => {
                            const meta = container;

                            stats[0].cpu_percent = (stats[0].cpu_percent).toFixed(1);
                            stats[0].mem_percent = (stats[0].mem_percent).toFixed(1);
                            stats[0].netIO.tx = (stats[0].netIO.tx / DEFAULT_CONVERSION).toFixed(1);
                            stats[0].netIO.rx = (stats[0].netIO.rx / DEFAULT_CONVERSION).toFixed(1);

                            stats[0].blockIO.w = (stats[0].blockIO.w / DEFAULT_CONVERSION).toFixed(1);
                            stats[0].blockIO.r = (stats[0].blockIO.r / DEFAULT_CONVERSION).toFixed(1);

                            meta.stats = Array.isArray(stats) == true ? stats[0] : null;
                            new_containers.push(meta);
                            next();
                        })
                        .catch(e => {
                            debug(e);
                            next();
                        });
                }, (err) => {
                    if (err) {
                        debug(err);
                    }
                    this.infos.containers = new_containers.sort((a, b) => {
                        const textA = a.name.toUpperCase();
                        const textB = b.name.toUpperCase();
                        return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
                    });
                    return cb();
                });
            })
            .catch(e => {
                debug(e);
                return cb();
            });
    }

    servicesSummary() {
        sysinfo.services("*")
            .then(services => {
                this.infos.services.running = services.filter(service => service.running === true);
                this.infos.services.stopped = services.filter(service => service.running === false);
            })
            .catch(e => {
                debug(e);
            });
    }

    processesSummary(cb) {
        psList()
            .then(processes => {
                this.infos.processes.cpu_sorted = processes
                    .filter((a: any) => !(a.cmd.includes("SystemInfo") && a.cmd.includes("PM2")))
                    .sort((a: any, b: any) => b.cpu - a.cpu).slice(0, 5);
                this.infos.processes.mem_sorted = processes
                    .filter((a: any) => !(a.cmd.includes("SystemInfo") && a.cmd.includes("PM2")))
                    .sort((a: any, b: any) => b.memory - a.memory).slice(0, 5);
                return cb();
            })
            .catch(e => {
                debug("Error when retrieving process list", e);
                return cb();
            });
    }

    cpuStatsWorker() {
        let cpuTempCollection;

        (cpuTempCollection = () => {
            sysinfo.cpuTemperature()
                .then(data => {
                    this.infos.cpu.temperature = data.main;
                    setTimeout(cpuTempCollection.bind(this), 2000);
                })
                .catch(e => {
                    setTimeout(cpuTempCollection.bind(this), 2000);
                });
        })();

        function fetch() {
            const startMeasure = computeUsage();

            setTimeout(_ => {
                const endMeasure = computeUsage();

                const idleDifference = endMeasure.idle - startMeasure.idle;
                const totalDifference = endMeasure.total - startMeasure.total;

                const percentageCPU = (10000 - Math.round(10000 * idleDifference / totalDifference)) / 100;
                this.infos.cpu.usage = (percentageCPU).toFixed(1);
            }, 100);
        }

        function computeUsage() {
            let totalIdle = 0;
            let totalTick = 0;
            const cpus = os.cpus();

            for (let i = 0, len = cpus.length; i < len; i++) {
                const cpu = cpus[i];
                for (const type in cpu.times) {
                    totalTick += cpu.times[type];
                }
                totalIdle += cpu.times.idle;
            }

            return {
                idle: parseInt((totalIdle / cpus.length) + ""),
                total: parseInt((totalTick / cpus.length) + "")
            };
        }

        setInterval(fetch.bind(this), 1000);
        fetch.bind(this)();
    }

    memStats(cb) {
        sysinfo.mem()
            .then(data => {
                this.infos.mem.total = (data.total / DEFAULT_CONVERSION).toFixed(2);
                this.infos.mem.free = (data.free / DEFAULT_CONVERSION).toFixed(2);
                this.infos.mem.active = (data.active / DEFAULT_CONVERSION).toFixed(2);
                this.infos.mem.available = (data.available / DEFAULT_CONVERSION).toFixed(2);
                return cb();
            })
            .catch(e => {
                debug("Error while getting memory info", e);
                return cb();
            });
    }

    networkConnectionsWorker() {
        let retrieveConn;

        (retrieveConn = () => {
            sysinfo.networkConnections()
                .then(conns => {
                    this.infos.connections = conns
                        .filter(conn => conn.localport != "443" && conn.peerport != "443")
                        .map((conn: any) => `${conn.localaddress}:${conn.localport}-${conn.peeraddress}:${conn.peerport}-${conn.proc ? conn.proc : "unknown"}`);
                    setTimeout(retrieveConn.bind(this), 10 * 1000);
                })
                .catch(e => {
                    debug("Error while retrieving filesystem infos", e);
                    setTimeout(retrieveConn.bind(this), 10 * 1000);
                });
        })();
    }

    disksStatsWorker() {
        let rx = 0;
        let wx = 0;
        let started = false;
        let fsSizeCollection, ioCollection;

        (fsSizeCollection = () => {
            sysinfo.fsSize()
                .then(fss => {
                    const fse = fss.filter(fs => (fs.size / (1024 * 1024)) > 200);
                    this.infos.storage.filesystems = fse;
                    setTimeout(fsSizeCollection.bind(this), 30 * 1000);
                })
                .catch(e => {
                    debug("Error while retrieving filesystem infos", e);
                    setTimeout(fsSizeCollection.bind(this), 10 * 1000);
                });
        })();

        (ioCollection = () => {
            sysinfo.fsStats()
                .then((fs_stats: any) => {
                    const new_rx = fs_stats.rx;
                    const new_wx = fs_stats.wx;

                    const read = ((new_rx - rx) / DEFAULT_CONVERSION).toFixed(3);
                    const write = ((new_wx - wx) / DEFAULT_CONVERSION).toFixed(3);

                    if (started == true) {
                        this.infos.storage.io.read.add(parseFloat(read));
                        this.infos.storage.io.write.add(parseFloat(write));
                    }

                    rx = new_rx;
                    wx = new_wx;
                    started = true;
                    setTimeout(ioCollection.bind(this), 1000);
                })
                .catch(e => {
                    debug("Error while getting network statistics", e);
                    setTimeout(ioCollection.bind(this), 1000);
                });
        })();
    }

    fdStatsWorker() {
        const getFDOpened = () => {
            fs.readFile("/proc/sys/fs/file-nr", (err, out) => {
                if (err) {
                    return;
                }
                const output = out.toString().trim();
                const parsed = output.split("\t");
                if (parsed.length !== 3) {
                    return;
                }
                this.infos.fd.opened = parseInt(parsed[0]);
                this.infos.fd.max = parseInt(parsed[2]);
            });
        };

        setInterval(() => {
            getFDOpened();
        }, 20 * 1000);

        getFDOpened();
    }

    networkStatsWorker() {
        // let latencyCollection;
        let networkStatsCollection;

        // (latencyCollection = () => {
        //   sysinfo.inetLatency()
        //     .then(latency => {
        //       this.infos.network.latency.add(latency)
        //       setTimeout(latencyCollection.bind(this), 2000)
        //     })
        //     .catch(e => {
        //       debug(e)
        //       setTimeout(latencyCollection.bind(this), 2000)
        //     })
        // })()

        sysinfo.networkInterfaceDefault((net_interface) => {
            let started = false;
            let rx = 0;
            let tx = 0;
            let rx_e = 0;
            let tx_e = 0;
            let rx_d = 0;
            let tx_d = 0;

            (networkStatsCollection = () => {
                sysinfo.networkStats(net_interface)
                    .then((net) => {
                        const new_rx = (net[0].rx_bytes - rx) / DEFAULT_CONVERSION;
                        const new_tx = (net[0].tx_bytes - tx) / DEFAULT_CONVERSION;
                        rx = net[0].rx_bytes;
                        tx = net[0].tx_bytes;

                        const new_rx_e = (net[0].rx_errors - rx_e) / DEFAULT_CONVERSION;
                        const new_tx_e = (net[0].tx_errors - tx_e) / DEFAULT_CONVERSION;
                        rx_e = net[0].rx_errors;
                        tx_e = net[0].tx_errors;

                        const new_rx_d = (net[0].rx_dropped - rx_d) / DEFAULT_CONVERSION;
                        const new_tx_d = (net[0].tx_dropped - tx_d) / DEFAULT_CONVERSION;
                        rx_d = net[0].rx_dropped;
                        tx_d = net[0].tx_dropped;

                        if (started == true) {
                            this.infos.network.rx_5.add(new_rx);
                            this.infos.network.tx_5.add(new_tx);
                            this.infos.network.rx_errors_60.add(new_rx_e);
                            this.infos.network.tx_errors_60.add(new_tx_e);
                            this.infos.network.rx_dropped_60.add(new_rx_d);
                            this.infos.network.tx_dropped_60.add(new_tx_d);
                        }
                        started = true;
                        setTimeout(networkStatsCollection.bind(this), 1000);
                    })
                    .catch(e => {
                        debug("Error on retrieving network stats", e);
                        setTimeout(networkStatsCollection.bind(this), 900);
                    });
            })();
        });

    }
}

if (require.main === module) {
    const sys = new SystemInfo();
    sys.startCollection();
}

export default SystemInfo;

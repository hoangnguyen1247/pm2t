
import PM2 from "../../API";
import psList from "../psList";

const SERVICES_ASSOCIATION = {
    "mongodb,mongo": {
        module: "pm2-mongodb"
    },
    "redis,redis-server": {
        module: "pm2-redis"
    },
    "elasticsearch": {
        module: "pm2-elasticsearch"
    },
    "docker": {
        module: "pm2-monit-docker"
    },
    "consul": {
        module: "pm2-monit-consul"
    },
    "pm2": {
        module: "pm2-probe"
    },
    "fpm": {
        module: "pm2-php-fpm"
    }
};

// 'python,python3': {
//   module: 'pm2-python'
// },
// 'nginx': {
//   module: 'pm2-monit-nginx'
// },
// 'haproxy': {
//   module: 'pm2-monit-haproxy'
// },
// 'traeffik': {
//   module: 'pm2-monit-traeffik'
// }

class ServicesDetection {
    pm2: any;

    constructor() {
        this.pm2 = new PM2();
    }

    startDetection(cb) {
        // Check running probes
        this.monitoredServices((err, pm2_services) => {
            // Check running services
            this.discover((err, required_modules) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const required_monitoring_probes = Object.keys(required_modules);
                // Make the diff between
                // console.log(`Need to start following modules:`)
                // console.log(_.difference(required_monitoring_probes, pm2_services))
                this.pm2.install("pm2-server-monit", (err, apps) => {
                    cb();
                });
            });
        });
    }

    monitoredServices(cb) {
        let f_proc_list = [];

        this.pm2.list((err, proc_list) => {
            f_proc_list = proc_list.map(p => {
                return p.name;
            });
            this.pm2.close();
            cb(err, f_proc_list);
        });
    }

    discover(cb) {
        psList()
            .then(processes => {
                const supported_systems = Object.keys(SERVICES_ASSOCIATION);
                const required_modules = {};

                processes.forEach((proc: any) => {
                    supported_systems.forEach(sup_sys => {
                        const proc_names = sup_sys.split(",");
                        proc_names.forEach(proc_name => {
                            if (proc.name.includes(proc_name) === true ||
                                proc.cmd.includes(proc_name) === true) {
                                const key = SERVICES_ASSOCIATION[sup_sys].module;
                                required_modules[key] = SERVICES_ASSOCIATION[sup_sys];
                                required_modules[key].monit = proc;
                            }
                        });
                    });
                });
                return cb(null, required_modules);
            })
            .catch(e => {
                console.error("Error while listing processes", e);
            });
    }
}

if (require.main === module) {
    const serviceDetection = new ServicesDetection();

    const process = (done) => {
        serviceDetection.startDetection(() => {
            done();
        });
    };

    const iterate = () => {
        process(() => {
            setTimeout(iterate, 3000);
        });
    };

    iterate();
}

const 
    fs = require("fs"),
    path = require("path");

const {ServiceWrapper} = require('trilliant');

const SQLServerPool = require('./SQLServerPool');

module.exports = class SQLService extends ServiceWrapper {
    constructor(app, config) {
        super(app, config);

        if(typeof config === "string")
            config = JSON.parse(fs.readFileSync(path.join(app.Env.appPath, config), "utf8"));

        this.SQLPool = new SQLServerPool(config);
    }

    start() { this.SQLPool.start(); }
    stop() { this.SQLPool.stop(); }

    register(plug, data) {
        let q;
        
        if(typeof data === "string")
            q = JSON.parse( fs.readFileSync(path.join(plug.homeDir, data)) );
        else q = data;
        
        plug.Queries = this.SQLPool.loadQueries(q, plug.homeDir);
    }
};

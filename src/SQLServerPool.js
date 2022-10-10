
const fs = require('fs'),
	path = require('path'),
	{Connection, Request} = require('tedious');

const {handleError, decode64} = require('./utils');
const {STATUS, MAX_POOL, DEFAULT_CONFIG} = require('./constants');
const {execJob, loadQueries} = require('./QueryJobs');



module.exports = class SQLServerPool {

	#config;
	#pool = [];
	#requestQueue = [];
	#running = true;
	#queueTimer = 100;


    constructor(config) {
        const sqlcfg = Object.assign({}, DEFAULT_CONFIG, config);
        if(sqlcfg.authentication.options.userName.startsWith('data:'))
            sqlcfg.authentication.options.userName = decode64(sqlcfg.authentication.options.userName);
        if(sqlcfg.authentication.options.password.startsWith('data:'))
            sqlcfg.authentication.options.password = decode64(sqlcfg.authentication.options.password);
        if(sqlcfg.server.startsWith('data:'))
            sqlcfg.server = decode64(sqlcfg.server);
		
		this.#config = sqlcfg;
    }


	acquireWorker() {
		return new Promise(resolve => {
			if(!this.#running) resolve(null);

			// find and return idle worker
			for(var i = this.#pool.length - 1; i >= 0; i--) {
				if(this.#pool[i].status == STATUS.IDLE) {
					return resolve(this.#pool[i]);
				}

				// remove broken workers
				if(this.#pool[i].status == STATUS.FAIL) {
					var broken = this.#pool.splice(i,1);
					broken.con.close();
				}
			}

			// no workers available, return null
			if(this.#pool.length >= MAX_POOL)
				return resolve(null);
			
			// or attempt to create a new worker
			var worker = {
				con: new Connection(this.#config),
				status: STATUS.NEW
			};
			
			// when connection made, return to caller
			con.on('connect', (err) => {
				if(err) return handleError(err);
				worker.status = STATUS.IDLE;
				return resolve(worker);
			});

			// if connection errors out, mark failed and resolve null
			// not sure if this can lead to multiple-resolve issue...
			con.on('error', (err) => {
				//console.log('aquireConnection()');
				handleError(err);
				worker.status = STATUS.FAIL;
				return resolve(null);
			});
			
			// if connection ends, remove from pool
			con.on('end', () => {
				for(var i = this.#pool.length - 1; i >= 0; i--) {
					if(this.#pool[i] === worker)
						return this.#pool.splice(i,1);
				}
			});
			
			this.#pool.push(worker);
		});
	}

	async #queueProc() {
		if(!this.#running) return;

		if(this.#requestQueue.length > 0) {
			var worker = await this.acquireWorker();
			if(worker != null) {
				var job = this.#requestQueue.shift();

				worker.con.removeAllListeners('socketError');
				worker.con.on('socketError', err => {
					handleError(err);
					worker.status = STATUS.FAIL;
					job.worker = null;
					this.#requestQueue.push(job);
					worker.con.removeAllListeners('socketError');
					this.#queueTimer = 2000;
				});

				job.worker = worker;
				execJob(job);
			}
		}

		if(this.#running) {
			setTimeout(this.#queueProc.bind(this), this.#queueTimer);
			if(this.#requestQueue.length > 0) this.#queueTimer = Math.max(10, this.#queueTimer - 10);
			else this.#queueTimer = Math.min(100, this.#queueTimer + 10);
		}
	}

	/**
	 * Start the pool. Queries will queue until the pool is started.
	 * 
	 */
	start() {
		this.#running = true;
		return setImmediate(this.#queueProc.bind(this));
	}

	/**
	 * Stops processing the queue.
	 */
	stop() {
		this.#running = false;
	}

	/**
	 * Stops queue and kills all connections.
	 */
	exit() {
		this.stop();
		for(var i = 0; i < this.#pool.length; i++) {
			this.#pool[i].con.close();
		}
	}
	
	/**
	 * Convenience method. Queues a query directly for Tedious.
	 * 
	 * @deprecated
	 * @param {*} sql 
	 * @param {*} callback 
	 */
	async exec(sql, callback) {
		this.#requestQueue.push((pooled) => {
			pooled.status = STATUS.BUSY;
			pooled.con.execSql(new Request(sql, (err, count, rows) => {
				pooled.status = STATUS.IDLE;
				if(callback) return callback(err, count, rows);
			}));
		});
	}
	
	/**
	 * Encapsulate queries as functions and associate with this pool.
	 * 
	 * @param {*} queryList 
	 * @param {*} baseDir 
	 * @returns 
	 */
	loadQueries(queryList, baseDir) {
		return loadQueries(queryList, baseDir, this.#requestQueue);
	}
};

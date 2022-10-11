/*================================
    QUERY / JOB FUNCTIONS
================================*/

const fs = require('fs'),
	path = require('path'),
	{Request} = require('tedious');

const { handleError } = require('./utils');
const { STATUS, LAMBDA, TYPES } = require('./constants');


/**
 * Set parameters based on keys in object.
 * 
 * @param {*} req 
 * @param {*} params 
 * @param {*} obj 
 */
function setParameters(req, params, obj) {
	for (var i = 0; i < params.length; i++) {
		req.addParameter(params[i].name, TYPES[params[i].type.toLowerCase()], obj[params[i].name], params[i].options);
	}
}

/**
 * Flatten a resultset from Tedious. Reduces rowdata to key/value pairs.
 * 
 * @param {*} rows Tedious resultset to flatten.
 * @returns Flattened results as array of objects with key/value pairs.
 */
function flattenResults(rows) {
	var rr = [];
	for (var i = 0; i < rows.length; i++) {
		rr.push(Object.entries(rows[i]).reduce((a, v) => { a[v[0]] = v[1].value; return a; }, {}));
	}
	return rr;
}

/**
 * Create a job struct.
 * 
 * @param {*} queryDef 
 * @param {*} params 
 * @param {*} callback 
 * @returns 
 */
function createJob(queryDef, params, callback) {
	return {
		queryDef: queryDef,
		params: params || {},
		callback: callback || queryDef.callback,
		worker: null
	};
}

/**
 * Execute a job.
 * 
 * @param {*} job 
 */
function execJob(job) {
    if(job.worker == null) return;

	job.worker.status = STATUS.BUSY;
	const req = new Request(job.queryDef.sql, job.resultHandler);
	setParameters(req, job.queryDef.params, job.params);
	if(job.queryDef.timeout) req.setTimeout(job.queryDef.timeout);
	job.worker.con.execSql(req);
}

/**
 * Create callback-style query encapsulation function.
 * 
 * @param {*} queryDef 
 * @param {*} queue 
 * @returns 
 */
function createCallbackQuery(queryDef, queue) {
	return (obj, optcallback) => {
		const job = createJob(queryDef, obj, optcallback);
		
		job.resultHandler = getCallbackHandler(job);
		queue.push(job);
	};
}

/**
 * Create result handler for callback query function.
 * 
 * @param {*} job 
 * @returns 
 */
function getCallbackHandler(job) {
	if(!job.callback) job.callback = LAMBDA;
	return (err, rowCount, rows) => {
		job.worker.status = STATUS.IDLE;
		return job.callback(err, rowCount, rows);
	}
}

/**
 * Create promise-style query encapsulation function.
 * 
 * @param {*} queryDef 
 * @param {*} queue 
 * @returns 
 */
function createPromiseQuery(queryDef, queue) {
	return obj => {
		return new Promise((resolve, reject) => {
			const job = createJob(queryDef, obj, resolve);
			job.reject = reject;
			job.resultHandler = getPromiseHandler(job, queue);
			queue.push(job);
		});
	};
}

/**
 * Creates result handler for promise query function.
 * 
 * @param {*} job 
 * @param {*} queue 
 * @returns 
 */
function getPromiseHandler(job, queue) {
	return (err, rowCount, rows) => {
		if(err) {
			handleError(err, job);
			// if timeout occurred, need to requeue
			if(err.code == "ETIMEOUT" || err.code == "ESOCKET") {
				job.worker.status = STATUS.FAIL;
				job.worker = null;
				return queue.push(job);
			} else return job.reject();
		}

		job.worker.status = STATUS.IDLE;
		if(rowCount == 0) return job.callback([]);
		if(!job.queryDef.flatten) return job.callback(rows);
		return job.callback(flattenResults(rows));
	}
}


/**
 * Load queries from a file and generate their encapsulation functions and tie them to given queue.
 * 
 * @param {*} queryList 
 * @param {*} baseDir 
 * @param {*} queue 
 * @returns 
 */
function loadQueries(queryList, baseDir, queue) {
    var queryHash = {};
    
    // default basedir is the one above node_modules
    if(!baseDir) baseDir = path.join(__dirname, '..', '..');
    
    for(var i = 0; i < queryList.length; i++) {
        // if sql starts with colon, load the query from a file
        if(queryList[i].sql.substr(0,1) == ':')
            queryList[i].sql = fs.readFileSync(path.join(baseDir, queryList[i].sql.substr(1)), 'utf8');
        
        if(!queryList[i].params) queryList[i].params = [];
        
        if(queryList[i].usePromise) queryHash[queryList[i].id] = createPromiseQuery(queryList[i], queue);
        else queryHash[queryList[i].id] = createCallbackQuery(queryList[i], queue);
    }
    
    return queryHash;
}


module.exports = {
    loadQueries: loadQueries,

    createJob: createJob,
    execJob: execJob
};


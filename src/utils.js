/*================================
    UTILITY METHODS
================================*/

module.exports.handleError = (err, job) => {
	if (global.output) {
		global.output.error(JSON.stringify(err));
		if (job)
			global.output.error(JSON.stringify(job.queryDef));
	} else
		console.log(JSON.stringify(err));
};

module.exports.decode64 = (str) => Buffer.from(str.replace(/^data\:/, ''), 'base64').toString('utf8');

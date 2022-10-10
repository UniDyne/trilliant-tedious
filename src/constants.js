/*================================
    CONSTANTS
================================*/

const {TYPES} = require('tedious');

// used to match type strings in parameter definitions
const TYPEHASH = {};
for(var k in TYPES) {
	if(TYPES.hasOwnProperty(k)) {
		TYPEHASH[k.toLowerCase()] = TYPES[k];
	}
}


module.exports = {
    STATUS: {
        NEW: 0,
        IDLE: 1,
        BUSY: 2,
        FAIL: 3
    },

    TYPES: TYPEHASH,

    MAX_POOL: 16,

    DEFAULT_CONFIG: {
        server: '127.0.0.1',
        authentication: {
            options: {
                userName: '',
                password: ''
            }
        }
    },

    LAMBDA: ()=>{}
};

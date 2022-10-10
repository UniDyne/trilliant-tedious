# trilliant-tedious

This is a refactor and hard fork of [node-sqlserver](https://github.com/UniDyne/node-sqlserver). In addition to the original functionality, this package acts as the service layer for MSSQL integration in newer versions of the [Trilliant](https://github.com/UniDyne/trilliant) framework.

It is not necessary to use this package with Trilliant. It may be used by itself in the same way as node-sqlserver.

## Tedious Wrapper

This package acts as a wrapper for the [Tedious](https://www.npmjs.com/package/tedious) driver. This wrapper can turn parameterized queries into function calls that support either the standard callback-style of Tedious or return Promises. The idea is to create an object that encapsulates a list of queries such that you get behaviour similar to a data access object and the particulars of the query are abstracted away.

Additionally, the wrapper implements SQL connection pooling. In apps that have multiple users or are otherwise highly asynchronous, pooling will prevent bottlenecks when dealing with multiple queries.

## Service for Trilliant

This package also exposes a "service" for Trilliant that is used to manage the pool and automatically encapsulate query definitions from plugins into functions.

## Installation
This module is not currently registered with NPM. In order to install, you must use the following command:

`npm install git+https://github.com/unidyne/trilliant-tedious.git`

## Usage Example

```js
const fs = require('fs'),
	{SQLServerPool} = require('trilliant-tedious');

// load tedious config from a JSON file
const sqlConfig = JSON.parse(fs.readFileSync('./etc/sqlserver.conf'));

// connect to SQL Server using this module

sqlServer = new SQLServerPool(sqlConfig);

// load queries (could use a JSON file)
const sqlQueries = sqlServer.loadQueries([
	{
		id: "getItems",
		asPromise: true,
		params: [
			{ "name": "id", "type": "int", "options": {} }
		],
		sql: "SELECT id, name FROM items WHERE cat_id = @id",
		flatten: true // return field values without metadata
	},{
		id: "getAllCategories",
		asPromise: false,
		params: [],
		sql: "SELECT id, name FROM category"
	}
]);

// query using callback
sqlQueries.getAllCategories({}, async (err, rowCount, rows) => {
	if(err) return;
	
	for(var i = 0; i < rows.length; i++) {
		
		// query using promise
		// getAllCategories is NOT flattened, so must use <field>.value
		var items = await sqlQueries.getItems( rows[i].id.value );
		
		// getItems IS flattened, so access value through field name
		for(var j = 0; j < items.length; j++)
			console.log("Item: " + items[j].name);
	}
});
```


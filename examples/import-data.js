const RoamPrivateApi = require( '../' );
const secrets = require( '../secrets.json' );
var fs = require( 'fs' );

const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: false,
	folder: './tmp/',
} );
api.import( [
	{ title: 'test', children: [ { string: 'Test child' }, { string: 'Another test child' } ] },
] );

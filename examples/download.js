const RoamPrivateApi = require( '../' );
const secrets = require( '../secrets.json' );

const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: false,
	folder: './tmp/',
	nodownload: false,
} );
api.getExportData().then( data => console.log( 'success', data ) );

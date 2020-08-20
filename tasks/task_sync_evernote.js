const RoamPrivateApi = require( '../private_api/RoamPrivateApi' );
const EvernoteSyncAdapter = require( './EvernoteSync' ); 
const secrets = require( '../secrets.json' );
const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, { headless: false, folder: './tmp/', nodownload: true } );
const e = new EvernoteSyncAdapter( { token: secrets.evernote_token, sandbox: false } );

api.getExportData().then( data => {
	e.processDump( data );
} );

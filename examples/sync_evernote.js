const RoamPrivateApi = require( '../' );
const EvernoteSyncAdapter = require( '../EvernoteSync' );
const secrets = require( '../secrets.json' );
var fs = require( 'fs' );
const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: false,
	folder: './tmp/',
	nodownload: true,
} );
const e = new EvernoteSyncAdapter( { token: secrets.evernote_token, sandbox: false } );

api
	.getExportData()
	.then( ( data ) => e.processJSON( data ) )
	.then( ( titleMapping ) => console.log( 'Success!' ) );

const RoamPrivateApi = require( '../' );
const EvernoteSyncAdapter = require( '../EvernoteSync' );
const secrets = require( '../secrets.json' );
var fs = require( 'fs' );

const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: true,
	folder: './tmp/',
    nodownload: false,
	// userDataDir: "./user_data",
    executablePath: '/usr/bin/google-chrome',
    // args: ['--no-sandbox', '--disable-setuid-sandbox']
} );
const e = new EvernoteSyncAdapter( { token: secrets.evernote_token, sandbox: false } );

fs.readFile( './tmp/mapping.json' )
	.then( data => e.init( JSON.parse( data ) ) )
	.catch( err => e.init( null ) )
    .then( () => api.getExportData() )
    // .then( () => console.log( Object.keys( e.mapping ).length ) );
	.then( ( data ) => e.processJSON( data ) )
	.then( ( titleMapping ) => fs.writeFile( './tmp/mapping.json', JSON.stringify( [ ...e.mapping ] ), 'utf8' ) )
	.then( () => console.log( 'success' ) );

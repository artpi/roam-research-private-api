const RoamPrivateApi = require( '../' );
const EvernoteSyncAdapter = require( '../EvernoteSync' );
const secrets = require( '../secrets.json' );
var fs = require( 'fs' ).promises;
var folder = process.env.FOLDER || './tmp/';

const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: process.env.HEADLESS !== 'false',
	folder: folder,
	nodownload: process.env.DOWNLOAD === 'false',
	// userDataDir: "./user_data",
	// executablePath: '/usr/bin/google-chrome',
	// args: ['--no-sandbox', '--disable-setuid-sandbox']
} );
const e = new EvernoteSyncAdapter( { token: secrets.evernote_token, sandbox: false }, secrets.graph );

let chain = fs.readFile( folder + 'mapping.json' )
	.then( ( data ) => e.init( JSON.parse( data ) ) )
	.catch( ( err ) => e.init( null ) )
	.then( () => e.getNotesToImport() )
	.then( payload => {
		if( payload.length > 0 ) {
			return api.import( ( e.getRoamPayload( payload ) ) );
		} else {
			return Promise.resolve();
		}
	} )
	.then( () => e.cleanupImportNotes() )
	.then( () => api.getExportData() )
	// .then( () => console.log( Object.keys( e.mapping ).length ) );
	.then( ( data ) => e.processJSON( data ) )
	.then( ( titleMapping ) =>
		fs.writeFile( folder + 'mapping.json', JSON.stringify( [ ...e.mapping ] ), 'utf8' )
	)
	.then( () => console.log( 'success' ) );

#!/usr/bin/env node
const RoamPrivateApi = require( '../' );
const secrets = require( '../secrets.json' );

async function run() {
	const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
		headless: false,
		folder: '.',
		nodownload: false,
	} );

	let filename = await api.getExportZip( 'edn' );

	console.log( `Wrote to ${ filename }` );
}

run().catch( ( e ) => {
	console.error( e );
	process.exit( 1 );
} );

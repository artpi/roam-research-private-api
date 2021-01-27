#!/usr/bin/env node
const yargs = require( 'yargs' );
const fetch = require( 'node-fetch' );
const { boolean } = require('yargs');

const argv = yargs
	.option( 'graph', {
		alias: 'g',
		description: 'Your graph name',
		type: 'string',
	} )
	.option( 'email', {
		alias: 'e',
		description: 'Your Roam Email',
		type: 'string',
	} )
	.option( 'password', {
		alias: 'p',
		description: 'Your Roam Password',
		type: 'string',
	} )
	.option( 'evernote_token', {
		alias: 't',
		description: 'Your Evernote Token',
		type: 'string',
	} )
	.option( 'debug', {
		description: 'enable debug mode',
		type: 'boolean',
		default: false,
	} )
	.option( 'nodownload', {
		description: 'Skip the download of the roam graph. Default no - do download.',
		type: 'boolean',
		default: false,
	} )
	.option( 'nosandbox', {
		description: 'Skip the Chrome Sandbox.',
		type: 'boolean',
		default: false,
	} )
	.option( 'executable', {
		description: 'Executable path to Chromium.',
		type: 'string',
		default: '',
	} )
	.option( 'verbose', {
		alias: 'v',
		description: 'You know, verbose.',
		type: 'boolean',
		default: false,
	} )
	.option( 'privateapiurl', {
		description: 'Additional endpoint that provides data to sync INTO Roam. Has nothing to do with Evernote, its just convenient.',
		type: 'string',
		default: '',
	} )
	.option( 'removezip', {
		description: 'If downloading the Roam Graph, should the timestamp zip file be removed after downloading?',
		type: 'boolean',
		default: true,
	} )
	.command(
		'sync <dir> [exporturl]',
		'Sync Roam to Evernote, with several additional actions.',
		() => {},
		( argv ) => {
			const RoamPrivateApi = require( '../' );
			const EvernoteSyncAdapter = require( '../EvernoteSync' );
			const options = {
				headless: ! argv.debug,
				nodownload: argv.nodownload,
				folder: argv['dir']
			};
			if ( argv[ 'executable' ] ) {
				options['executablePath'] = argv[ 'executable' ];
			}
			if ( argv[ 'nosandbox' ] ) {
				options['args'] = ['--no-sandbox', '--disable-setuid-sandbox'];
			}

			const e = new EvernoteSyncAdapter( { token: argv.evernoteToken, sandbox: false }, argv.graph );
			const api = new RoamPrivateApi( argv.graph, argv.email, argv.password, options );

			// This downloads the private additional content for my Roam graph, served by other means.
			const importIntoRoam = [];
			if ( argv.privateapiurl ) {
				const private_api = fetch( argv.privateapiurl ).then( response => response.json() );
				private_api.then( data => console.log( 'Private API payload', data ) );
				importIntoRoam.push( private_api );
			}

			// This finds notes IN Evernote to import into Roam:
			const evernote_to_roam = e.init( null )
			.then( () => e.getNotesToImport() )
			.then( payload => Promise.resolve( e.getRoamPayload( payload ) ) );
			importIntoRoam.push( evernote_to_roam );

			// Let's start the flow with Roam:
			const roamdata = Promise.all( importIntoRoam )
				.then( results => {
					const payload = results[0].concat( results[1] );
					if( payload.length > 0 ) {
						return api.import( payload );
					} else {
						return Promise.resolve();
					}
				} )
				.then( () => e.cleanupImportNotes() )
				.then( () => api.getExportData( ! argv.nodownload && argv['removezip'] ) ); // Removing zip is only possible if we downloaded it.

				// This will push Roam graph to the URL of your choice - can be WordPress
				if ( argv.exporturl ) {
					roamdata.then( data => fetch( argv.exporturl, {
						method: 'post',
						body: JSON.stringify( {
							graphContent: data,
							graphName: api.db
						} ),
						headers: {'Content-Type': 'application/json'}
					} ) )
					.then( ( data ) => console.log( 'Updated in your remote URL', data ) );
				}

				// This is the actual moment where we sync to Evernote:
				roamdata.then( ( data ) => e.processJSON( data ) )
				.then( () => console.log( 'success' ) );

		}
	)
	.help()
	.alias( 'help', 'h' )
	.env( 'ROAM_API' )
	.demandOption(
		[ 'graph', 'email', 'password' ],
		'You need to provide graph name, email and password'
	).argv;

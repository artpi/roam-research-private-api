#!/usr/bin/env node
const yargs = require( 'yargs' );
const fs = require( 'fs' );
const fetch = require( 'node-fetch' );

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
	.option( 'debug', {
		description: 'enable debug mode',
		type: 'boolean',
		default: false,
	} )
	.option( 'stdin', {
		alias: 'i',
		description: 'Read from STDIN',
		type: 'boolean',
		default: false,
	} )
	.option( 'removezip', {
		description: 'If downloading the Roam Graph, should the timestamp zip file be removed after downloading?',
		type: 'boolean',
		default: true,
	} )
	.command(
		'query [query]',
		'Query your Roam Graph using datalog syntax',
		() => {},
		( argv ) => {
			let input = '';
			if ( argv.stdin ) {
				input = fs.readFileSync( 0, 'utf-8' );
			} else {
				input = argv['query'];
			}

			if ( ! input || input.length < 3 ) {
				console.warn( 'You have to provide a query at least 3 chars long' );
				return;
			}
			console.log( "Logging in to your Roam and running query:" );
			console.log( input );
			const RoamPrivateApi = require( '../' );
			const api = new RoamPrivateApi( argv.graph, argv.email, argv.password, {
				headless: ! argv.debug,
			} );

            api.logIn()
            .then( () => api.runQuery( input ) )
            .then( result => {
                console.log( JSON.stringify( result, null, 4 ) );
                api.close();
            } );
		}
	)
	.command(
		'search <query>',
		'Query your Roam Graph blocks using simple text search.',
		() => {},
		( argv ) => {
			const RoamPrivateApi = require( '../' );
			const api = new RoamPrivateApi( argv.graph, argv.email, argv.password, {
				headless: ! argv.debug,
			} );

            api.logIn()
            .then( () => api.runQuery( api.getQueryToFindBlocks( argv['query'] ) ) )
            .then( result => {
				result = result.map( result => ( {
					blockUid: result[0],
					pageTitle: result[2],
					string: result[1]
				} ) );
                console.log( JSON.stringify( result, null, 4 ) );
                api.close();
            } );
		}
	)
	.command(
		'export <dir> [exporturl]',
		'Export your Roam database to a selected directory. If URL is provided, then the concent will be sent by POST request to the specified URL.',
		() => {},
		( argv ) => {
			const RoamPrivateApi = require( '../' );
			const api = new RoamPrivateApi( argv.graph, argv.email, argv.password, {
				headless: ! argv.debug,
				folder: argv['dir']
			} );
			let promises = api.getExportData( argv['removezip'] );
			promises.then( data => console.log( 'Downloaded' ) );
			if ( argv['exporturl'] ) {
				promises.then( data => fetch( argv['exporturl'], {
					method: 'post',
					body: JSON.stringify( {
						graphContent: data,
						graphName: api.graph
					} ),
					headers: {'Content-Type': 'application/json'}
				} ) )
				.catch( err => console.log( err ) )
				.then( () => console.log( "Uploaded to export url." ) )
			}
		}
	)
	.help()
	.alias( 'help', 'h' )
	.env( 'ROAM_API' )
	.demandOption(
		[ 'graph', 'email', 'password' ],
		'You need to provide graph name, email and password'
	).argv;

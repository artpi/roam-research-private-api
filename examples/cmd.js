#!/usr/bin/env node
const yargs = require( 'yargs' );
const fs = require( 'fs' );

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
	} )
	.option( 'stdin', {
		alias: 'i',
		description: 'Read from STDIN',
		type: 'boolean',
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
	.help()
	.alias( 'help', 'h' )
	.env( 'ROAM_API' )
	.demandOption(
		[ 'graph', 'email', 'password' ],
		'You need to provide graph name, email and password'
	).argv;

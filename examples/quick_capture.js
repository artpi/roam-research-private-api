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
		'$0',
		'Save Quick capture',
		() => {},
		( argv ) => {
			let input = '';
			if ( argv.stdin ) {
				input = fs.readFileSync( 0, 'utf-8' );
			} else {
				input = argv[ '_' ].join( ' ' );
			}

			if ( ! input || input.length < 3 ) {
				console.warn( 'You have to provide a note at least 3 chars long' );
				return;
			}
			const RoamPrivateApi = require( '../' );
			const api = new RoamPrivateApi( argv.graph, argv.email, argv.password, {
				headless: ! argv.debug,
			} );

			api.quickCapture( [ input ] );
		}
	)
	.help()
	.alias( 'help', 'h' )
	.demandOption(
		[ 'graph', 'email', 'password' ],
		'You need to provide graph name, email and password'
	).argv;

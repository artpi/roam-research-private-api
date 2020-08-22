const RoamPrivateApi = require( '../private_api/RoamPrivateApi' );
const secrets = require( '../secrets.json' );
const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: false,
} );

api.quickCapture( [
	'This is a note from some web address [Source](http://www.wp.pl)',
] );

const RoamPrivateApi = require( '../' );
const secrets = require( '../secrets.json' );
const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, {
	headless: false,
} );

api.quickCapture( [ 'This is [a great site](https://deliber.at)' ] );

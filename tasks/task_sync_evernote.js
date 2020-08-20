const RoamPrivateApi = require( '../private_api/RoamPrivateApi' );
const secrets = require( '../secrets.json' );
const api = new RoamPrivateApi( secrets.graph, secrets.email, secrets.password, { headless: false, folder: './tmp/' } );


api.getExportData().then( data => console.log( data ) );
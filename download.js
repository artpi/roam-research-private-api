const puppeteer = require('puppeteer');
const fs = require('fs');
const readdirSync = fs.readdirSync;
const lstatSync = fs.lstatSync;
const unzip = require( 'node-unzip-2' );

const credentials = require('secrets.json');

async function logInAndTriggerDownload( email, pass, db, folder ) {
	const browser = await puppeteer.launch( {
		headless: false,
	} );
	const page = await browser.newPage();
	await page._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: folder });
    await page.goto( 'https://roamresearch.com/#/app/' + db );
    await page.waitForNavigation();
    await page.waitForSelector('input[name=email]');
    // Login
    await page.type('input[name=email]', email );
    await page.type('input[name=password]', pass);
    await page.click('.bp3-button');
    // Try to download
    await page.waitForSelector('.bp3-icon-more');
    await page.click('.bp3-icon-more');
    // This should contain "Export All"
    await page.waitFor( 2000 );
    await page.click('.bp3-menu :nth-child(4) a');
    //Change markdown to JSON:
    // This should contain markdown
    await page.waitFor( 2000 );
    await page.click('.bp3-dialog-container .bp3-popover-wrapper button');
    // This should contain JSON
    await page.waitFor( 2000 );
    await page.click('.bp3-dialog-container .bp3-popover-wrapper .bp3-popover-dismiss');
   // This should contain "Export All"
    await page.waitFor( 2000 );
    await page.click('.bp3-dialog-container .bp3-intent-primary');
    return browser;
}

function getLatestFile( dir ) {
	const orderReccentFiles = (dir ) =>
	  readdirSync(dir)
	    .filter(f => lstatSync(dir + f).isFile())
	    .filter(f => f.indexOf( 'Roam-Export' ) !== -1 )
	    .map(file => ({ file, mtime: lstatSync( dir + file).mtime }))
	    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

	const getMostRecentFile = (dir ) => {
	  const files = orderReccentFiles(dir);
	  return files.length ? files[0] : undefined;
	};
	return dir + getMostRecentFile(dir).file;
}

function getContentsOfRepo( dir, file ) {
	return new Promise( ( resolve, reject ) => {
		const stream = fs.createReadStream( file ).pipe( unzip.Parse() );
		stream.on('entry', function (entry) {
		    var fileName = entry.path;
		    var type = entry.type; // 'Directory' or 'File'
		    var size = entry.size;
		    if ( fileName.indexOf('.json' ) != -1 ) {
		      entry.pipe( fs.createWriteStream( dir + 'db.json' ) );
		    } else {
		      entry.autodrain();
		    }
		  });
		stream.on( 'finish', function() {
			fs.readFile( dir + 'db.json', 'utf8', function( err, data ) {
				if( err ) {
					reject( err );
				} else {
					resolve( JSON.parse( data ) );
					fs.unlink( dir + 'db.json', () => {} );
				}
			} );
		} );
	} );
}

( async () => {
	const folder = './tmp/';
	const browser = logInAndTriggerDownload( secrets.email, secrets.password, secrets.graph );
	const file = getLatestFile( folder );
	const data = await getContentsOfRepo( folder, file );
	console.log( data );
})()
const puppeteer = require('puppeteer');
const fs = require('fs');
const readdirSync = fs.readdirSync;
const lstatSync = fs.lstatSync;
const unzip = require( 'node-unzip-2' );
const Evernote = require( 'evernote' );

const secrets = require('./secrets.json');
const { runInThisContext } = require('vm');

async function logInAndTriggerDownload( email, pass, db, folder ) {
	const browser = await puppeteer.launch( {
		headless: true,
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

    await page.waitFor( 10000 );
    // Network idle is a hack to wait until we donwloaded stuff
    await page.goto('https://news.ycombinator.com/', {waitUntil: 'networkidle2'});
	browser.close();
    return;
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



class RoamSyncAdapter {
	credentials;
	pages = [];
	titleMapping = {};

	constructor( data ) {
		this.credentials = data;
	}

	sync( pages ) {
		console.log( pages );
	}

	wrapItem( string ) {
		const intend = ''; // this has to grow
		return intend + ' - ' + string + `
		`;
	}

	wrapChildren( childrenString ) {
		return childrenString.join( '' );
	}

	wrapText( string ) {
		return string;
	}
	flattenRoamDB( roamData, level ) {
		let ret = '';
		if( roamData.string ) {
			ret += this.wrapText( roamData.string );
		}
		if( roamData.children ) {
			ret += this.wrapChildren( roamData.children.map( child => this.flattenRoamDB( child, level +1 ) ) );
		}
		return this.wrapItem( ret );
	}

	processDump( data ) {
		this.pages = data.map( page => {
			const newPage = {
				title: page.title,
				updateTime: page["edit-time"],
				content: '',
			}
			if( page.string ) {
				newPage.content = page.string;
			}
			if ( page.children && page.children[ 0 ] ) {
				newPage.uid = page.children[ 0 ].uid;
				newPage.content += this.flattenRoamDB( page, 0 );
			}
			this.titleMapping[ page.title ] = newPage;
			return newPage;
		} );
		this.sync( this.pages );
	}
}

class EvernoteSyncAdapter extends RoamSyncAdapter{
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';

	wrapItem( string ) {
		return `<li>${string}</li>`;
	}
	wrapText( string ) {
		return this.htmlEntities( string );
	}

	wrapChildren( childrenString ) {
		childrenString = childrenString.join( '' );
		return `<ul>${childrenString}</ul>`;
	}
	htmlEntities(str) {
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
	makeNote( noteTitle, noteBody ) {
 
		// Create note object
		var ourNote = new Evernote.Types.Note();
		ourNote.title = this.htmlEntities( noteTitle );
	   
		// Build body of note
	  
		var nBody = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
		nBody += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
		nBody += "<en-note>" + noteBody;
		nBody += "</en-note>";
		ourNote.content = nBody;
		
		// parentNotebook is optional; if omitted, default notebook is used
		if (this.notebookGuid) {
		  ourNote.notebookGuid = this.notebookGuid;
		}
	   
		return this.NoteStore.createNote( ourNote );
	  }

	findNotebook() {
		return new Promise( ( resolve, reject ) => {
			this.NoteStore.listNotebooks().then(
				notebooks => {
					const filtered = notebooks.filter( nb => ( nb.name === 'Roam' ) )
					if ( filtered ) {
						this.notebookGuid = filtered[ 0 ].guid;
						resolve( this.notebookGuid );
					} else {
						console.log( 'You have to have a notebook named "Roam"' );
						reject( 'You have to have a notebook named "Roam"' );
					}
				}
			);
		} );
	}

	sync( pages ) {
		this.EvernoteClient = new Evernote.Client( this.credentials );
		this.NoteStore = this.EvernoteClient.getNoteStore();
		this.findNotebook()
		.then ( () => {
			pages.forEach( page => this.syncPage( page ) );
		} )
		.catch( err => console.log( err ) );
	}

	syncPage( page ) {
		return this.makeNote( page.title, page.content );
	};

}



( async () => {
	const folder = './tmp/';
	const browser = await logInAndTriggerDownload( secrets.email, secrets.password, secrets.graph, folder );
	const file = getLatestFile( folder );
	const data = await getContentsOfRepo( folder, file );
	const e = new EvernoteSyncAdapter( { token: secrets.evernote_token, sandbox: false } );
	e.processDump( data );
})()

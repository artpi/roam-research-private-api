const puppeteer = require( 'puppeteer' );
const fs = require( 'fs' );
const os = require( 'os' );
const unzip = require( 'node-unzip-2' );
const { isString } = require( 'util' );

class RoamPrivateApi {
	options;
	browser;
	page;
	db;
	login;
	pass;

	constructor( db, login, pass, options = { headless: true, folder: null, nodownload: false } ) {
		this.db = db;
		this.login = login;
		this.pass = pass;
		this.options = options;
		// If you dont pass folder option, we will use the system tmp directory.
		if ( ! options.folder ) {
			options.folder = os.tmpdir();
		}
	}

	async getExportData() {
		// Mostly for testing purposes when we want to use a preexisting download.
		if ( ! this.options.nodownload ) {
			await this.logIn();
			await this.downloadExport( this.options.folder );
		}
		const latestExport = this.getLatestFile( this.options.folder );
		const content = await this.getContentsOfRepo( this.options.folder, latestExport );
		await this.close();
		return content;
	}
	/**
	 * Logs in to Roam interface.
	 */
	async logIn() {
		if ( this.browser ) {
			return this.browser;
		}
		this.browser = await puppeteer.launch( this.options );
		try {
			this.page = await this.browser.newPage();
			await this.page.goto( 'https://roamresearch.com/#/app/' + this.db );
			await this.page.waitForNavigation();
			await this.page.waitForSelector( 'input[name=email]' );
		} catch ( e ) {
			console.error( 'Cannot load the login screen!' );
			throw e;
		}
		// Login
		await this.page.type( 'input[name=email]', this.login );
		await this.page.type( 'input[name=password]', this.pass );
		await this.page.click( '.bp3-button' );
		await this.page.waitForSelector( '.bp3-icon-more' );
		return;
	}

	async quickCapture( text = [] ) {
		await this.logIn();
		const page = await this.browser.newPage();
		await page.emulate( puppeteer.devices[ 'iPhone X' ] );
		// set user agent (override the default headless User Agent)
		await page.goto( 'https://roamresearch.com/#/app/' + this.db );

		await page.waitForSelector( '#block-input-quick-capture-window-qcapture' );
		if ( isString( text ) ) {
			text = [ text ];
		}

		text.forEach( async function ( t ) {
			await page.type( '#block-input-quick-capture-window-qcapture', t );
			await page.click( 'button.bp3-intent-primary' );
		} );
		// page.close();
		await this.close();
		return;
	}
	async downloadExport( folder ) {
		await this.page._client.send( 'Page.setDownloadBehavior', {
			behavior: 'allow',
			downloadPath: folder,
		} );
		// Try to download
		await this.page.waitForSelector( '.bp3-icon-more' );
		await this.page.click( '.bp3-icon-more' );
		// This should contain "Export All"
		await this.page.waitFor( 2000 );
		await this.page.click( '.bp3-menu :nth-child(4) a' );
		//Change markdown to JSON:
		// This should contain markdown
		await this.page.waitFor( 2000 );
		await this.page.click( '.bp3-dialog-container .bp3-popover-wrapper button' );
		// This should contain JSON
		await this.page.waitFor( 2000 );
		await this.page.click( '.bp3-dialog-container .bp3-popover-wrapper .bp3-popover-dismiss' );
		// This should contain "Export All"
		await this.page.waitFor( 2000 );
		await this.page.click( '.bp3-dialog-container .bp3-intent-primary' );

		await this.page.waitFor( 10000 );
		// Network idle is a hack to wait until we donwloaded stuff
		await this.page.goto( 'https://news.ycombinator.com/', { waitUntil: 'networkidle2' } );
		return;
	}
	async close() {
		if ( this.browser ) {
			await this.page.waitFor( 1000 );
			await this.browser.close();
			this.browser = null;
		}
		return;
	}

	getLatestFile( dir ) {
		const orderReccentFiles = ( dir ) =>
			fs
				.readdirSync( dir )
				.filter( ( f ) => fs.lstatSync( dir + f ).isFile() )
				.filter( ( f ) => f.indexOf( 'Roam-Export' ) !== -1 )
				.map( ( file ) => ( { file, mtime: fs.lstatSync( dir + file ).mtime } ) )
				.sort( ( a, b ) => b.mtime.getTime() - a.mtime.getTime() );

		const getMostRecentFile = ( dir ) => {
			const files = orderReccentFiles( dir );
			return files.length ? files[ 0 ] : undefined;
		};
		return dir + getMostRecentFile( dir ).file;
	}

	getContentsOfRepo( dir, file ) {
		return new Promise( ( resolve, reject ) => {
			const stream = fs.createReadStream( file ).pipe( unzip.Parse() );
			stream.on( 'entry', function ( entry ) {
				var fileName = entry.path;
				var type = entry.type; // 'Directory' or 'File'
				var size = entry.size;
				if ( fileName.indexOf( '.json' ) != -1 ) {
					entry.pipe( fs.createWriteStream( dir + 'db.json' ) );
				} else {
					entry.autodrain();
				}
			} );
			stream.on( 'finish', function () {
				fs.readFile( dir + 'db.json', 'utf8', function ( err, data ) {
					if ( err ) {
						reject( err );
					} else {
						resolve( JSON.parse( data ) );
						fs.unlink( dir + 'db.json', () => {} );
					}
				} );
			} );
		} );
	}
}

module.exports = RoamPrivateApi;

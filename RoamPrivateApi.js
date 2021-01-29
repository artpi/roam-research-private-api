const puppeteer = require( 'puppeteer' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const unzip = require( 'node-unzip-2' );
const { isString } = require( 'util' );
const moment = require( 'moment' );
const stream = require( 'stream' );
const { promisify } = require( 'util' );

const pipeline = promisify( stream.pipeline );

/**
 * This class represents wraps Puppeteer and exposes a few methods useful in manipulating Roam Research.
 */
class RoamPrivateApi {
	options;
	browser;
	page;
	db;
	login;
	pass;

	constructor( db, login, pass, options = { headless: true, folder: null, nodownload: false } ) {
		// If you dont pass folder option, we will use the system tmp directory.
		if ( ! options.folder ) {
			options.folder = os.tmpdir();
		}
		options.folder = fs.realpathSync( options.folder );
		this.db = db;
		this.login = login;
		this.pass = pass;
		this.options = options;
	}

	/**
	 * Run a query on the new Roam Alpha API object.
	 * More about the query syntax: https://www.zsolt.blog/2021/01/Roam-Data-Structure-Query.html
	 * @param {string} query - datalog query.
	 */
	async runQuery( query ) {
		return await this.page.evaluate( ( query ) => {
			if ( ! window.roamAlphaAPI ) {
				return Promise.reject( 'No Roam API detected' );
			}
			const result = window.roamAlphaAPI.q( query );
			console.log( result );
			return Promise.resolve( result );
		}, query );
	}

	/**
	 * Create a block as a child of block.
	 * @param {string} text 
	 * @param {uid} uid - parent UID where block has to be inserted.
	 */
	async createBlock( text, uid ) {
		const result = await this.page.evaluate( ( text, uid ) => {
			if ( ! window.roamAlphaAPI ) {
				return Promise.reject( 'No Roam API detected' );
			}
			const result = window.roamAlphaAPI.createBlock(
				{"location": 
					{"parent-uid": uid, 
					 "order": 0}, 
				 "block": 
					{"string": text}})
			console.log( result );
			return Promise.resolve( result );
		}, text, uid );
		// Let's give time to sync.
		await this.page.waitForTimeout( 1000 );
		return result;
	}

	/**
	 * Delete blocks matching the query. Hass some protections, but
	 * THIS IS VERY UNSAFE. DO NOT USE THIS IF YOU ARE NOT 100% SURE WHAT YOU ARE DOING
	 * @param {string} query - datalog query to find blocks to delete. Has to return block uid.
	 * @param {int} limit - limit deleting to this many blocks. Default is 1.
	 */
	async deleteBlocksMatchingQuery( query, limit ) {
		if ( ! limit ) {
			limit = 1;
		}
		return await this.page.evaluate( ( query, limit ) => {
			if ( ! window.roamAlphaAPI ) {
				return Promise.reject( 'No Roam API detected' );
			}
			const result = window.roamAlphaAPI.q( query );
			console.log( result );
			if ( result.length > 100 ) {
				return Promise.reject( 'Too many results. Is your query ok?' );

			}
			const limited = result.slice( 0, limit );
			limited.forEach( ( block ) => {
				const id = block[0];
				console.log( 'DELETING', id );
				window.roamAlphaAPI.deleteBlock( { block: { uid: id } } );
			} );
			return Promise.resolve( limited );
		}, query, limit );
	}

	/**
	 * Returns a query to find blocks with exact text on the page with title.
	 * Useful with conjuction with deleteBlocksMatchingQuery,
	 * @param {string} text - Exact text in the block.
	 * @param {*} pageTitle - page title to find the blocks in.
	 */
	getQueryToFindBlocksOnPage( text, pageTitle ) {
		text = text.replace( '"', '\"' );
		pageTitle = pageTitle.replace( '"', '\"' );

		return `[:find ?uid
			:where [?b :block/string "${text}"]
				   [?b :block/uid  ?uid]
				   [?b :block/page ?p]
				   [?p :node/title "${pageTitle}"]]`;
	}

	/**
	 * Returns datalog query to find all blocks containing the text.
	 * Returns results in format [[ blockUid, text, pageTitle ]].
	 * @param {string} text - text to search.
	 */
	getQueryToFindBlocks( text ) {
		text = text.replace( '"', '\"' );
		return `[:find ?uid ?string ?title :where
			[?b :block/string ?string]
			[(clojure.string/includes? ?string "${text}")]
			[?b :block/uid  ?uid]
			[?b :block/page ?p]
			[?p :node/title ?title]
		]`;
	}

	/**
	 * When importing in Roam, import leaves an "Import" block.
	 * This removes that from your daily page.
	 * THIS IS UNSAFE since it deletes blocks.
	 */
	async removeImportBlockFromDailyNote() {
		await this.deleteBlocksMatchingQuery(
			this.getQueryToFindBlocksOnPage(
				'Import',
				this.dailyNoteTitle()
			),
			1
		);
		//Lets give time to sync
		await this.page.waitForTimeout( 1000 );
		return;
	}

	/**
	 * Return page title for the current daily note.
	 */
	dailyNoteTitle() {
		return moment( new Date() ).format( 'MMMM Do, YYYY' );
	}
	/**
	 * Return page uid for the current daily note.
	 */
	dailyNoteUid() {
		return moment( new Date() ).format( 'MM-DD-YYYY' );
	}

	/**
	 * Export your Roam database and return the data.
	 * @param {boolean} autoremove - should the zip file be removed after extracting?
	 * @param {boolean} format - The export format to download. md|json|edn. Defaults to md
	 */
	async getExportData( autoremove, format ) {
		// Mostly for testing purposes when we want to use a preexisting download.
		if ( ! this.options.nodownload ) {
			await this.logIn();
			await this.downloadExport( this.options.folder, format );
		}
		const latestExport = this.getLatestFile( this.options.folder );
		const content = await this.getContentsOfRepo( this.options.folder, latestExport );
		if ( autoremove ) {
			fs.unlinkSync( latestExport );
		}
		await this.close();
		return content;
	}

	/**
	 * Export your Roam database and return the path to the downloaded ZIP file.
	 * @param {boolean} format - The export format to download. md|json|edn. Defaults to md
	 */
	async getExportZip( format ) {
		// Mostly for testing purposes when we want to use a preexisting download.
		if ( ! this.options.nodownload ) {
			await this.logIn();
			await this.downloadExport( this.options.folder, format );
		}
		const latestExport = this.getLatestFile( this.options.folder );
		await this.close();
		return latestExport;
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
			this.page.setDefaultTimeout( 60000 );
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

	/**
	 * Import blocks to your Roam graph
	 * @see examples/import.js.
	 * @param {array} items 
	 */
	async import( items = [] ) {
		const fileName = path.resolve( this.options.folder, 'roam-research-private-api-sync.json' );
		fs.writeFileSync( fileName, JSON.stringify( items ) );
		await this.logIn();
		await this.page.waitForSelector( '.bp3-icon-more' );
		await this.clickMenuItem( 'Import Files' );
		// await this.page.click( '.bp3-icon-more' );
		// // This should contain "Export All"
		// await this.page.waitFor( 2000 );
		// await this.page.click( '.bp3-menu :nth-child(5) a' );
		await this.page.waitForSelector( 'input[type=file]' );
		await this.page.waitForTimeout( 1000 );
		// get the ElementHandle of the selector above
		const inputUploadHandle = await this.page.$( 'input[type=file]' );

		// Sets the value of the file input to fileToUpload
		inputUploadHandle.uploadFile( fileName );
		await this.page.waitForSelector( '.bp3-dialog .bp3-intent-primary' );
		await this.page.click( '.bp3-dialog .bp3-intent-primary' );
		await this.page.waitForTimeout( 3000 );
		await this.removeImportBlockFromDailyNote();
		return;
	}

	/**
	 * Inserts text to your quickcapture.
	 * @param {string} text 
	 */
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
		await page.waitForTimeout( 500 );
		// page.close();
		await this.close();
		return;
	}

	/**
	 * Click item in the side-menu. This is mostly internal.
	 * @param {string} title 
	 */
	async clickMenuItem( title ) {
		await this.page.click( '.bp3-icon-more' );
		// This should contain "Export All"
		await this.page.waitForTimeout( 1000 );
		await this.page.evaluate( ( title ) => {
			const items = [ ...document.querySelectorAll( '.bp3-menu li a' ) ];
			items.forEach( ( item ) => {
				console.log( item.innerText, title );
				if ( item.innerText === title ) {
					item.click();
					return;
				}
			} );
		}, title );
	}

	/**
	 * Download Roam export to a selected folder.
	 * @param {string} folder
	 */
	async downloadExport( folder, format ) {
		format = format || 'md';

		const formatString = {
			md: 'Markdown',
			json: 'JSON',
			edn: 'EDN',
		};

		let expectedFormat = formatString[ format ] || formatString.md;

		await this.page._client.send( 'Page.setDownloadBehavior', {
			behavior: 'allow',
			downloadPath: folder,
		} );
		// Try to download
		// await this.page.goto( 'https://roamresearch.com/#/app/' + this.db );
		// await this.page.waitForNavigation();
		await this.page.waitForSelector( '.bp3-icon-more' );
		await this.clickMenuItem( 'Export All' );
		// await this.page.click( '.bp3-icon-more' );
		// // This should contain "Export All"
		// await this.page.waitFor( 2000 );
		// await this.page.click( '.bp3-menu :nth-child(4) a' );

		// Select the requested format
		await this.page.waitForTimeout( 2000 );

		// First see what is already selected.
		let currentSelection = await this.page.$eval(
			'.bp3-dialog-container .bp3-popover-wrapper .bp3-button-text',
			( e ) => e.innerText
		);

		if ( currentSelection !== expectedFormat ) {
			// Open the dropdown
			await this.page.click( '.bp3-dialog-container .bp3-popover-wrapper button' );

			// Examine the options and click the one we want.
			let selections = await this.page.$$( '.bp3-dialog-container .bp3-popover-wrapper li a div' );
			let buttonText = await Promise.all(
				selections.map( ( s ) => s.evaluate( ( e ) => e.innerText ) )
			);
			let desiredIndex = buttonText.findIndex( ( t ) => t == expectedFormat );
			if ( desiredIndex >= 0 ) {
				await selections[ desiredIndex ].click();
			}
			await this.page.$$( '.bp3-dialog-container .bp3-popover-wrapper li a div', { hidden: true } );
		}

		// This should contain "Export All"
		await this.page.click( '.bp3-dialog-container .bp3-intent-primary' );

		await this.page.waitForTimeout( 60000 ); // This can take quite some time on slower systems
		// Network idle is a hack to wait until we donwloaded stuff. I don't think it works though.
		await this.page.goto( 'https://news.ycombinator.com/', { waitUntil: 'networkidle2' } );
		return;
	}

	/**
	 * Close the fake browser session.
	 */
	async close() {
		if ( this.browser ) {
			await this.page.waitForTimeout( 1000 );
			await this.browser.close();
			this.browser = null;
		}
		return;
	}

	/**
	 * Get the freshest file in the directory, for finding the newest export.
	 * @param {string} dir 
	 */
	getLatestFile( dir ) {
		const orderReccentFiles = ( dir ) =>
			fs
				.readdirSync( dir )
				.filter( ( f ) => fs.lstatSync( path.resolve( dir, f ) ) && fs.lstatSync( path.resolve( dir, f ) ).isFile() )
				.filter( ( f ) => f.indexOf( 'Roam-Export' ) !== -1 )
				.map( ( file ) => ( { file, mtime: fs.lstatSync( path.resolve( dir, file ) ).mtime } ) )
				.sort( ( a, b ) => b.mtime.getTime() - a.mtime.getTime() );

		const getMostRecentFile = ( dir ) => {
			const files = orderReccentFiles( dir );
			return files.length ? files[ 0 ] : undefined;
		};
		return path.resolve( dir, getMostRecentFile( dir ).file );
	}

	/**
	 * Unzip the export and get the content.
	 * @param {string} dir
	 * @param {string} file
	 */
	getContentsOfRepo( dir, file ) {
		let resolveFile;

		return new Promise( ( resolve, reject ) => {
			let donePromises = [];
			const stream = fs.createReadStream( file ).pipe( unzip.Parse() );
			stream.on( 'entry', function ( entry ) {
				var fileName = entry.path;
				var type = entry.type; // 'Directory' or 'File'
				var size = entry.size;
				let outputFilename;
				if ( fileName.indexOf( '.json' ) != -1 ) {
					outputFilename = 'db.json';
					resolveFile = outputFilename;
				} else if ( fileName.indexOf( '.edn' ) != -1 ) {
					outputFilename = 'db.edn';
					resolveFile = outputFilename;
				} else if ( fileName.indexOf( '.md' ) != -1 ) {
					outputFilename = fileName;
				} else {
					entry.autodrain();
				}

				if ( outputFilename ) {
					// Markdown files can be in nested directories, so see if we need to create the directories.
					let outputDir = path.dirname( outputFilename );
					if ( outputDir && outputDir !== '.' ) {
						try {
							fs.mkdirSync( path.resolve( dir, outputDir ), { recursive: true } );
						} catch ( e ) {
							// If the directory already exists, that's ok.
							// Anything else is an error
							if ( e.code !== 'EEXIST' ) {
								throw e;
							}
						}
					}

					let donePromise = pipeline(
						entry,
						fs.createWriteStream( path.resolve( dir, outputFilename ) )
					);
					donePromises.push( donePromise );
				}
			} );
			stream.on( 'close', async function () {
				await Promise.all( donePromises );

				if ( resolveFile ) {
					fs.readFile( path.resolve( dir, resolveFile ), 'utf8', function ( err, data ) {
						if ( err ) {
							reject( err );
						} else {
							if ( resolveFile.endsWith( '.json' ) ) {
								resolve( JSON.parse( data ) );
							} else {
								resolve( data );
							}
						}
					} );
				} else {
					// For markdown, just resolve the directory name since there are multiple files
					resolve( dir );
				}
			} );
		} );
	}
}

module.exports = RoamPrivateApi;

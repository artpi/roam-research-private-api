const Evernote = require( 'evernote' );
const ENML = require( 'enml-js' );
const RoamSyncAdapter = require( './Sync' );
const moment = require( 'moment' );

class EvernoteSyncAdapter extends RoamSyncAdapter {
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';
	mapping;
	backlinks = {};
	notesBeingImported = [];

	wrapItem( string, title ) {
		return `<li>${ string }</li>`;
	}
	wrapText( string, title ) {
		const backlinks = [];
		string = this.htmlEntities( string );
		string = string.replace( '{{[[TODO]]}}', '<en-todo/>' );
		string = string.replace( '{{{[[DONE]]}}}}', '<en-todo checked="true"/>' );
		string = string.replace( /\!\[([^\]]*?)\]\(([^\)]+)\)/g, '<img src="$2"/>' );
		string = string.replace( /\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>' );
		string = string.replace( '/**([^*]+)**/g', '<b>$1</b>' );
		string = string.replace( /\[\[([^\]]+)\]\]/g, ( match, contents ) => {
			if ( this.mapping.get( contents ) ) {
				const guid = this.mapping.get( contents );
				const url = this.getNoteUrl( guid );
				backlinks.push( contents );
				return `<a href="${ url }">${ contents }</a>`;
			}
			return match;
		} );
		this.addBacklink( backlinks, title, string );
		return string;
	}

	wrapChildren( childrenString ) {
		childrenString = childrenString.join( '' );
		return `<ul>${ childrenString }</ul>`;
	}
	htmlEntities( str ) {
		return String( str )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' );
	}
	htmlEntitiesDecode( str ) {
		return String( str )
			.replace( '&amp;', '&' )
			.replace( '&lt;', '<' )
			.replace( '&gt;', '>' )
			.replace( '&quot;', '"' );
	}
	wrapNote( noteBody ) {
		var nBody = '<?xml version="1.0" encoding="UTF-8"?>';
		nBody += '<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">';
		nBody += '<en-note>' + noteBody;
		nBody += '</en-note>';
		return nBody;
	}

	makeNote( noteTitle, noteBody, url ) {
		// if( ! this.mapping.get( noteTitle ) ) {
		// 	console.log(noteTitle);
		// }
		// return Promise.resolve();
		// Create note object
		let note;
		if ( this.mapping.get( noteTitle ) ) {
			// console.log( '[[' + noteTitle + ']] should already exist' );
			note = this.NoteStore.getNote( this.mapping.get( noteTitle ), true, false, false, false );
			note.catch( ( err ) => {
				console.warn( '[[' + noteTitle + ']] :Took too long to pull note ' );
			} );
			// note.catch( err => new Promise( ( resolve, reject ) => setTimeout( () => {
			// 	console.log( 'Took to long, retrying ' + noteTitle );
			// 	resolve( this.NoteStore.getNote( guid, true, false, false, false ) );
			// } ) ) );
		} else {
			note = Promise.resolve( new Evernote.Types.Note() );
		}
		return note.then( ( ourNote ) => {
			// Build body of note

			var nBody = this.wrapNote( noteBody );
			if ( ourNote.content && ourNote.content === nBody ) {
				// console.log( '[[' + noteTitle + ']]: has not changed, skipping' );
				return Promise.resolve( ourNote );
			}
			ourNote.content = nBody;

			const attributes = new Evernote.Types.NoteAttributes();
			attributes.contentClass = 'piszek.roam';
			attributes.sourceURL = url;
			attributes.sourceApplication = 'piszek.roam';
			ourNote.attributes = attributes;
			ourNote.title = this.htmlEntities( noteTitle );

			if ( ourNote.guid ) {
				console.log( '[[' + noteTitle + ']]: updating' );
				return this.NoteStore.updateNote( ourNote );
			} else {
				// parentNotebook is optional; if omitted, default notebook is used
				if ( this.notebookGuid ) {
					ourNote.notebookGuid = this.notebookGuid;
				}
				console.log( '[[' + noteTitle + ']] Creating new note ' );
				return this.NoteStore.createNote( ourNote ).then( ( note ) => {
					this.mapping.set( noteTitle, note.guid );
					return Promise.resolve( note );
				} );
			}
		} );
	}

	findNotebook() {
		return new Promise( ( resolve, reject ) => {
			this.NoteStore.listNotebooks().then( ( notebooks ) => {
				const filtered = notebooks.filter( ( nb ) => nb.name === 'Roam' );
				if ( filtered ) {
					this.notebookGuid = filtered[ 0 ].guid;
					resolve( this.notebookGuid );
				} else {
					console.log( 'You have to have a notebook named "Roam"' );
					reject( 'You have to have a notebook named "Roam"' );
				}
			} );
		} );
	}
	getNotesToImport() {
		const filter = new Evernote.NoteStore.NoteFilter();
		const spec = new Evernote.NoteStore.NotesMetadataResultSpec();
		spec.includeTitle = false;
		filter.words = 'tag:RoamInbox';
		const batchCount = 100;
		const loadMoreNotes = ( result ) => {
			if ( result.notes ) {
				this.notesBeingImported = this.notesBeingImported.concat(
					result.notes.map( ( note ) =>
						this.NoteStore.getNote( note.guid, true, false, false, false )
					)
				);
			}
			if ( result.startIndex < result.totalNotes ) {
				return this.NoteStore.findNotesMetadata(
					filter,
					result.startIndex + result.notes.length,
					batchCount,
					spec
				).then( loadMoreNotes );
			} else {
				return Promise.resolve( this.mapping );
			}
		};
		return this.NoteStore.findNotesMetadata( filter, 0, batchCount, spec )
			.then( loadMoreNotes )
			.then( () =>
				Promise.all( this.notesBeingImported ).then( ( notes ) => {
					this.notesBeingImported = notes;
					return Promise.resolve( notes );
				} )
			);
	}
	adjustTitle( title ) {
		if ( title === 'Bez tytułu' || title === 'Untitled Note' ) {
			return moment( new Date() ).format( 'MMMM Do, YYYY' );
		} else {
			return title;
		}
	}
	getRoamPayload() {
		return this.notesBeingImported.map( ( note ) => {
			const md = ENML.PlainTextOfENML( note.content );
			return {
				title: this.adjustTitle( note.title ),
				children: [ { string: md } ],
			};
		} );
	}
	cleanupImportNotes() {
		return Promise.all(
			this.notesBeingImported.map( ( note ) => {
				note.tagGuids = [];
				note.tagNames = [ 'RoamImported' ];
				return this.NoteStore.updateNote( note );
			} )
		);
	}

	loadPreviousNotes() {
		let duplicates = 0;
		const filter = new Evernote.NoteStore.NoteFilter();
		const spec = new Evernote.NoteStore.NotesMetadataResultSpec();
		spec.includeTitle = true;
		filter.words = 'contentClass:piszek.roam';
		const batchCount = 100;

		const loadMoreNotes = ( result ) => {
			if ( result.notes ) {
				result.notes.forEach( ( note ) => {
					const title = this.htmlEntitiesDecode( note.title );
					if ( ! this.mapping.get( title ) ) {
						this.mapping.set( title, note.guid );
					} else if ( this.mapping.get( title ) !== note.guid ) {
						console.log(
							'[[' + title + ']]',
							'Note is a duplicate ',
							this.mapping.get( title ),
							note.guid
						);
						// this.NoteStore.deleteNote( note.guid );
					}
				} );
			}
			if ( result.startIndex < result.totalNotes ) {
				return this.NoteStore.findNotesMetadata(
					filter,
					result.startIndex + result.notes.length,
					batchCount,
					spec
				).then( loadMoreNotes );
			} else {
				console.log( this.mapping.batchCount );
				return Promise.resolve( this.mapping );
			}
		};
		return this.NoteStore.findNotesMetadata( filter, 0, batchCount, spec ).then( loadMoreNotes );
	}

	addBacklink( titles, target, text ) {
		titles.forEach( ( title ) => {
			if ( ! this.backlinks[ title ] ) {
				this.backlinks[ title ] = [];
			}
			this.backlinks[ title ].push( {
				target: target,
				text: text,
			} );
		} );
	}
	getNoteUrl( guid ) {
		return `evernote:///view/${ this.user.id }/${ this.user.shardId }/${ guid }/${ guid }/`;
	}
	init( prevData = {} ) {
		this.mapping = new Map( prevData );
		this.EvernoteClient = new Evernote.Client( this.credentials );
		this.NoteStore = this.EvernoteClient.getNoteStore();

		return Promise.all( [
			new Promise( ( resolve, reject ) => {
				this.EvernoteClient.getUserStore()
					.getUser()
					.then( ( user ) => {
						this.user = user;
						resolve();
					} );
			} ),
			this.findNotebook().catch( ( err ) => console.log( 'Cannot find notebook Roam:', err ) ),
			this.loadPreviousNotes(),
		] );
	}

	sync( pages ) {
		// This can potentially introduce a race condition, but it's unlikely. Famous last words.
		var p = Promise.resolve();
		pages.forEach( ( page ) => {
			p = p
				.then( () => this.syncPage( page ) )
				.catch( ( err ) => console.warn( 'Problem with syncing page ' + page.title, err ) );
		} );
		return p.then( () => Promise.resolve( this.mapping ) );
	}

	syncPage( page ) {
		let url;
		if ( page.uid ) {
			url = 'https://roamresearch.com/#/app/artpi/page/' + page.uid;
		} else {
			url = 'https://roamresearch.com/#/app/artpi';
		}
		let newContent = page.content;
		if ( this.backlinks[ page.title ] ) {
			const list = this.backlinks[ page.title ]
				.map( ( target ) => {
					let reference = '[[' + target.target + ']]';
					if ( this.mapping.get( target.target ) ) {
						reference =
							'<a href="' +
							this.getNoteUrl( this.mapping.get( target.target ) ) +
							'">' +
							target.target +
							'</a>';
					}
					return '<li>' + reference + ': ' + target.text + '</li>';
				} )
				.join( '' );

			const backlinks = '<h3>Linked References</h3><ul>' + list + '</ul>';
			newContent = page.content + backlinks;
		}

		return this.makeNote( page.title, newContent, url );
	}
}

module.exports = EvernoteSyncAdapter;

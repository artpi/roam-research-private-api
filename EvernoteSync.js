const Evernote = require( 'evernote' );
const RoamSyncAdapter = require( './Sync' );

class EvernoteSyncAdapter extends RoamSyncAdapter {
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';
	mapping = {};
	backlinks = {};

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
		string = string.replace( '/\*\*(.*?)\*\*/g', '<b>$1</b>' );
		string = string.replace( /\[\[([^\]]+)\]\]/g, ( match, contents ) => {
			if ( this.mapping[ contents ] ) {
				const guid = this.mapping[ contents ];
				const url = this.getNoteUrl( guid );
				backlinks.push( contents );
				return `<a href="${ url }">${ contents }</a>`;
			}
			return match;
		} );
		this.addBacklink( backlinks , title, string );
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

	wrapNote( noteBody ) {
		var nBody = '<?xml version="1.0" encoding="UTF-8"?>';
		nBody += '<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">';
		nBody += '<en-note>' + noteBody;
		nBody += '</en-note>';
		return nBody;
	}

	makeNote( noteTitle, noteBody, url, guid = null ) {
		// Create note object
		let note;
		if ( guid ) {
			console.log( 'Note ' + noteTitle + ' should already exist' );
			note = this.NoteStore.getNote( guid, true, false, false, false );
			note.catch( err => {
				console.warn( 'Took too long to pull note ' + noteTitle );
			} );
			// note.catch( err => new Promise( ( resolve, reject ) => setTimeout( () => {
			// 	console.log( 'Took to long, retrying ' + noteTitle );
			// 	resolve( this.NoteStore.getNote( guid, true, false, false, false ) );
			// } ) ) );
		} else {
			console.log( 'Creating new note for ' + noteTitle );
			note = Promise.resolve( new Evernote.Types.Note() );
		}
		return note.then( ( ourNote ) => {
			// Build body of note

			var nBody = this.wrapNote( noteBody );
			if ( ourNote.content && ourNote.content === nBody ) {
				console.log( 'Content of ' + noteTitle + ' has not changed, skipping' );
				return Promise.resolve( ourNote );
			}
			ourNote.content = nBody;

			const attributes = new Evernote.Types.NoteAttributes();
			attributes.contentClass = 'piszek.roam';
			attributes.sourceURL = url;
			attributes.sourceApplication = 'piszek.roam';
			ourNote.attributes = attributes;
			ourNote.title = this.htmlEntities( noteTitle );

			console.log( 'saving note ' + noteTitle );
			if ( guid ) {
				return this.NoteStore.updateNote( ourNote );
			} else {
				// parentNotebook is optional; if omitted, default notebook is used
				if ( this.notebookGuid ) {
					ourNote.notebookGuid = this.notebookGuid;
				}
				return this.NoteStore.createNote( ourNote );
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
	loadPreviousNotes() {
		const filter = new Evernote.NoteStore.NoteFilter();
		const spec = new Evernote.NoteStore.NotesMetadataResultSpec();
		spec.includeTitle = true;
		filter.words = 'contentClass:piszek.roam';
		const batchCount = 100;

		const loadMoreNotes = ( result ) => {
			if ( result.notes ) {
				result.notes.forEach( ( note ) => {
					this.mapping[ note.title ] = note.guid;
				} );
			}
			if ( result.startIndex + result.notes.length < result.totalNotes ) {
				return this.NoteStore.findNotesMetadata(
					filter,
					result.startIndex + batchCount,
					batchCount,
					spec
				).then( loadMoreNotes );
			} else {
				return Promise.resolve( this.mapping );
			}
		};
		return this.NoteStore.findNotesMetadata( filter, 0, batchCount, spec ).then( loadMoreNotes );
	}

	addBacklink( titles, target, text ) {
		titles.forEach( title => {
			if ( ! this.backlinks[ title ] ) {
				this.backlinks[ title ] = [];
			}
			this.backlinks[ title ].push( {
				target: target,
				text: text
			} );
		} );
	}
	getNoteUrl( guid ) {
		return `evernote:///view/${ this.user.id }/${ this.user.shardId }/${ guid }/${ guid }/`;
	}
	init() {
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
			this.findNotebook().catch( ( err ) => console.log( err ) ),
			this.loadPreviousNotes()
		] );
	}

	sync( pages ) {
		// This can potentially introduce a race condition, but it's unlikely. Famous last words.
		return Promise.all( pages.map( ( page ) => this.syncPage( page ) ) );
	}

	syncPage( page ) {
		let url;
		if ( page.uid ) {
			url = 'https://roamresearch.com/#/app/artpi/page/' + page.uid;
		} else {
			url = 'https://roamresearch.com/#/app/artpi';
		}
		let newContent = page.content;
		if( this.backlinks[ page.title ] ) {
			const list = this.backlinks[ page.title ]
			.map(
				( target ) => {
					let reference = '[[' + target.target + ']]';
					if( this.mapping[ target.target ] ) {
						reference = '<a href="' + this.getNoteUrl( this.mapping[ target.target ] ) + '">' + target.target + '</a>';
					}
					return '<li>' + reference + ': ' + target.text + '</li>';
				}
					
			)
			.join( '' );
		
			const backlinks = '<h3>Linked References</h3><ul>' + list + '</ul>';
			newContent = page.content + backlinks;
			console.log( newContent );
		}

		return this.makeNote(
			page.title,
			newContent,
			url,
			this.mapping[ page.title ] ? this.mapping[ page.title ] : null
		);
	}
}

module.exports = EvernoteSyncAdapter;

const Evernote = require( 'evernote' );
const RoamSyncAdapter = require( './Sync' );

class EvernoteSyncAdapter extends RoamSyncAdapter {
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';
	mapping = {};

	wrapItem( string ) {
		return `<li>${ string }</li>`;
	}
	wrapText( string ) {
		string = this.htmlEntities( string );
		string = string.replace( '{{[[TODO]]}}', '<en-todo/>' );
		string = string.replace( '{{{[[DONE]]}}}}', '<en-todo checked="true"/>' );
		string = string.replace( /\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>' );
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
	makeNote( noteTitle, noteBody, url ) {
		// Create note object
		const attributes = new Evernote.Types.NoteAttributes();
		attributes.contentClass = 'piszek.roam';
		attributes.sourceURL = url;
		attributes.sourceApplication = 'piszek.roam';
		var ourNote = new Evernote.Types.Note();
		ourNote.attributes = attributes;
		ourNote.title = this.htmlEntities( noteTitle );

		// Build body of note

		var nBody = '<?xml version="1.0" encoding="UTF-8"?>';
		nBody += '<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">';
		nBody += '<en-note>' + noteBody;
		nBody += '</en-note>';
		ourNote.content = nBody;

		// parentNotebook is optional; if omitted, default notebook is used
		if ( this.notebookGuid ) {
			ourNote.notebookGuid = this.notebookGuid;
		}

		return this.NoteStore.createNote( ourNote );
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

	sync( pages ) {
		this.EvernoteClient = new Evernote.Client( this.credentials );
		// This can potentially introduce a race condition, but it's unlikely. Famous last words.
		this.EvernoteClient.getUserStore()
			.getUser()
			.then( ( user ) => {
				this.user = user;
			} );
		this.NoteStore = this.EvernoteClient.getNoteStore();
		this.findNotebook()
			.catch( ( err ) => console.log( err ) )
			.then( () => Promise.all( pages.map( ( page ) => this.syncPage( page ) ) ) )
			.then( () => {
				Object.values( this.mapping ).forEach( ( note2 ) => {
					const new_content = note2.content.replace( /\[\[([^\]]+)\]\]/g, ( match, contents ) => {
						if ( this.mapping[ contents ] && this.mapping[ contents ].guid ) {
							const guid = this.mapping[ contents ].guid;
							const url = `evernote:///view/${ this.user.id }/${ this.user.shardId }/${ guid }/${ guid }/`;
							return `<a href="${ url }">${ contents }</a>`;
						}
						return match;
					} );
					if ( note2.content !== new_content ) {
						note2.content = new_content;
						console.log( 'updating note', note2.title, note2.guid );
						this.NoteStore.updateNote( note2 );
					}
				} );
			} );
	}

	syncPage( page ) {
		let url;
		if ( page.uid ) {
			url = 'https://roamresearch.com/#/app/artpi/page/' + page.uid;
		} else {
			url = 'https://roamresearch.com/#/app/artpi';
		}

		const note = this.makeNote( page.title, page.content, url );
		note.then( ( note2 ) => {
			this.mapping[ note2.title ] = note2;
		} );
		return note;
	}
}

module.exports = EvernoteSyncAdapter;

const Evernote = require( 'evernote' );
const RoamSyncAdapter = require( './Sync' );

class EvernoteSyncAdapter extends RoamSyncAdapter {
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';

	wrapItem( string ) {
		return `<li>${ string }</li>`;
	}
	wrapText( string ) {
		return this.htmlEntities( string );
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
	makeNote( noteTitle, noteBody ) {
		// Create note object
		var ourNote = new Evernote.Types.Note();
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
		this.NoteStore = this.EvernoteClient.getNoteStore();
		this.findNotebook()
			.then( () => {
				pages.forEach( ( page ) => this.syncPage( page ) );
			} )
			.catch( ( err ) => console.log( err ) );
	}

	syncPage( page ) {
		return this.makeNote( page.title, page.content );
	}
}

module.exports = EvernoteSyncAdapter;

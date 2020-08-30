const Evernote = require( 'evernote' );
const RoamSyncAdapter = require( './Sync' );

class EvernoteSyncAdapter extends RoamSyncAdapter {
	EvernoteClient = null;
	NoteStore = null;
	notebookGuid = '';
	mapping = {};
	backlinks = {};

	wrapItem( string ) {
		return `<li>${ string }</li>`;
	}
	wrapText( string ) {
		string = this.htmlEntities( string );
		string = string.replace( '{{[[TODO]]}}', '<en-todo/>' );
		string = string.replace( '{{{[[DONE]]}}}}', '<en-todo checked="true"/>' );
		string = string.replace( /!\[([^\]]+)\]\(([^\)]+)\)/g, '<img src="$2"/>' );
		string = string.replace( /\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>' );
		string = string.replace( '**(.*?)**', '<b>$1</b>' );
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
			note = this.NoteStore.getNote( guid, true, false, false, false );
			console.log( 'Note ' + noteTitle + ' should already exist' );
		} else {
			note = Promise.resolve( new Evernote.Types.Note() );
			console.log( 'Creating new note for ' + noteTitle );
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

	addBacklink( title, note ) {
		if ( ! this.backlinks[ title ] ) {
			this.backlinks[ title ] = [];
		}
		this.backlinks[ title ].push( note );
	}
	getNoteUrl( guid ) {
		return `evernote:///view/${ this.user.id }/${ this.user.shardId }/${ guid }/${ guid }/`;
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
		return this.findNotebook()
			.catch( ( err ) => console.log( err ) )
			.then( () => this.loadPreviousNotes() )
			.then( () => Promise.all( pages.map( ( page ) => this.syncPage( page ) ) ) )
			.then( () =>
				Promise.all(
					Object.values( this.mapping ).map( ( note2 ) => {
						// Notes with empty content may have issues?
						if ( ! note2 || ! note2.content ) {
							return Promise.resolve();
						}
						const new_content = note2.content.replace( /\[\[([^\]]+)\]\]/g, ( match, contents ) => {
							if ( this.mapping[ contents ] && this.mapping[ contents ].guid ) {
								const guid = this.mapping[ contents ].guid;
								const url = this.getNoteUrl( guid );
								this.addBacklink( contents, note2 );
								return `<a href="${ url }">${ contents }</a>`;
							}
							return match;
						} );
						if ( note2.content !== new_content ) {
							note2.content = new_content;
							console.log( 'updating note with links' + note2.title );
							return this.NoteStore.updateNote( note2 );
						} else {
							return Promise.resolve();
						}
					} )
				)
			)
			.then( () =>
				Promise.all(
					Object.keys( this.backlinks ).map( ( title ) => {
						const list = this.backlinks[ title ]
							.map(
								( note ) =>
									'<li><a href="' + this.getNoteUrl( note.guid ) + '">' + note.title + '</a></li>'
							)
							.join( '' );
						const backlinks = '<h2>Linked References</h2><ul>' + list + '</ul>';
						if ( ! this.mapping[ title ].content ) {
							this.mapping[ title ].content = this.wrapNote( backlinks );
						} else {
							this.mapping[ title ].content = this.mapping[ title ].content.replace(
								'</en-note>',
								backlinks + '</en-note>'
							);
						}
						console.log( 'Updating backlinks in ' + title );
						return this.NoteStore.updateNote( this.mapping[ title ] ).catch( ( err ) =>
							console.log( 'Problem while updating backlinks in ' + title, err )
						);
					} )
				).catch( ( err ) => console.log( 'Problem while updating backlinks', err ) )
			);
	}

	syncPage( page ) {
		let url;
		if ( page.uid ) {
			url = 'https://roamresearch.com/#/app/artpi/page/' + page.uid;
		} else {
			url = 'https://roamresearch.com/#/app/artpi';
		}

		const note = this.makeNote(
			page.title,
			page.content,
			url,
			this.mapping[ page.title ] ? this.mapping[ page.title ] : null
		);
		note.then( ( note2 ) => {
			this.mapping[ note2.title ] = note2;
		} );
		return note;
	}
}

module.exports = EvernoteSyncAdapter;

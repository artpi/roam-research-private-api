class RoamSyncAdapter {
	credentials;
	pages = [];
	titleMapping = {};

	constructor( data ) {
		this.credentials = data;
	}

	sync( pages ) {
		return new Promise( ( resolve, reject ) => {
			console.log( pages );
			resolve( this.titleMapping );
		} );
	}

	wrapItem( string, title ) {
		const intend = ''; // this has to grow
		return (
			intend +
			' - ' +
			string +
			`
		`
		);
	}

	wrapChildren( childrenString, title ) {
		return childrenString.join( '' );
	}

	wrapText( string, title ) {
		return string;
	}
	flattenRoamDB( roamData, level, title ) {
		let ret = '';
		if ( roamData.string ) {
			ret += this.wrapText( roamData.string, title );
		}
		if ( roamData.children ) {
			ret += this.wrapChildren(
				roamData.children.map( ( child ) => this.flattenRoamDB( child, level + 1, title ) )
			);
		}
		return this.wrapItem( ret, title );
	}

	processJSON( newData ) {
		this.pages = newData.map( ( page ) => {
			const newPage = {
				title: page.title,
				updateTime: page[ 'edit-time' ],
				content: '',
			};
			if ( page.string ) {
				newPage.content = page.string;
			}
			if ( page.children && page.children[ 0 ] ) {
				newPage.uid = page.children[ 0 ].uid;
				newPage.content += this.flattenRoamDB( page, 0, page.title );
			}
			// It will be set if previously saved. Otherwise, we have to 'empty it';
			if ( ! this.titleMapping[ page.title ] ) {
				this.titleMapping[ page.title ] = {};
			}
			Object.assign( this.titleMapping[ page.title ], newPage );
			return newPage;
		} );
		return this.sync( this.pages );
	}
}

module.exports = RoamSyncAdapter;

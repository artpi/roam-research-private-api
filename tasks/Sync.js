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
		return (
			intend +
			' - ' +
			string +
			`
		`
		);
	}

	wrapChildren( childrenString ) {
		return childrenString.join( '' );
	}

	wrapText( string ) {
		return string;
	}
	flattenRoamDB( roamData, level ) {
		let ret = '';
		if ( roamData.string ) {
			ret += this.wrapText( roamData.string );
		}
		if ( roamData.children ) {
			ret += this.wrapChildren(
				roamData.children.map( ( child ) => this.flattenRoamDB( child, level + 1 ) )
			);
		}
		return this.wrapItem( ret );
	}

	processDump( data ) {
		this.pages = data.map( ( page ) => {
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
				newPage.content += this.flattenRoamDB( page, 0 );
			}
			this.titleMapping[ page.title ] = newPage;
			return newPage;
		} );
		this.sync( this.pages );
	}
}

module.exports = RoamSyncAdapter;

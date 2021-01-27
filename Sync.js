class RoamSyncAdapter {
	credentials;
	graphName = '';
	pages = [];
	titleMapping;

	constructor( data, graphName ) {
		this.titleMapping = new Map();
		this.credentials = data;
		this.graphName = graphName;
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
				uid: page.uid,
				title: page.title,
				updateTime: page[ 'edit-time' ],
				content: '',
			};
			if ( page.string ) {
				newPage.content = page.string;
			}
			if ( page.children && page.children[ 0 ] ) {
				newPage.content += this.flattenRoamDB( page, 0, page.title );
			}
			this.titleMapping.set( page.title, newPage );
			return newPage;
		} );
		return this.sync( this.pages );
	}
}

module.exports = RoamSyncAdapter;

#!/usr/bin/env node
var fs = require( 'fs' );
var requirejs = require('requirejs');

var config = {
	appDir: "public/",
	baseUrl: 'js',
	dir: "public-build",
	keepBuildDir: false,
	optimize: "uglify", //TODO до 2.0.3 может калечить toplevel.
	uglify: {
		toplevel: false,
		ascii_only: false,
		beautify: false
	},
	optimizeCss: false, //Не трогаем css
	preserveLicenseComments: false, //Удаляем лицензионные комментарии
	removeCombined: true, //Удаляем файлы, которые заинлайнились в модуль
	map: {
		'*': {
			'knockout': 'lib/knockout/knockout-2.1.0',
			'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
			'leaflet': 'lib/leaflet/leaflet_0.4.0.min'
		}
	},
	paths: {
		'jquery': 'lib/jquery/jquery-1.7.2.min',
		'socket.io': 'empty:', //Говорим, что socket.io не надо включать в выходной файл
		'domReady': 'lib/require/plugins/domReady',
		'text': 'lib/require/plugins/text',
		'async': 'lib/require/plugins/async',
		'goog': 'lib/require/plugins/goog',
		'Utils': 'lib/Utils',
		'Browser': 'lib/Browser',
		'jquery.datepick': 'lib/jquery/plugins/datepick/jquery.datepick',
		'jquery.datepick.lang': 'lib/jquery/plugins/datepick/jquery.datepick.lang',
		'jquery.ui': 'lib/jquery/ui/jquery-ui-1.8.22.custom.min',
		'jquery.jgrid': 'lib/jquery/plugins/grid/jquery.jqGrid.min',
		'jquery.jgrid.en': 'lib/jquery/plugins/grid/i18n/grid.locale-en'
	},
	modules: [
		{
			name: "appMap"
		},
		{
			name: "appProfile"
		},
		{
			name: "appAdmin"
		}
	]
};

requirejs.optimize(config, function (buildResponse) {
	//buildResponse is just a text output of the modules
	//included. Load the built file for the contents.
	//Use config.out to get the optimized file contents.
	console.log('Build finished');
	//var contents = fs.readFileSync(config.out, 'utf8');
});
/*global requirejs:true, require:true*/
requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	//deps: ['lib/JSExtensions'],
	//Shim позволит нам настроить зависимоти для скриптов, которые не содержат define, чтобы объявить себя модулем
	shim: {
		'backbone': {
			deps: [
				'underscore',
				'jquery'
			],
			exports: 'Backbone'
		},
		'backbone.queryparams': {
			deps: [
				'backbone'
			]//, exports: ' Backbone.Router.arrayValueSplit'
		},
		'highstock': {
			deps: [
				'jquery'
			],
			exports: 'Highcharts'
		}
	},
	map: {
		'*': {
			'css': 'lib/require/plugins/require-css/css'
		}
	},
	paths: {
		'tpl': '../tpl',
		'style': '../style',

		'm': 'module',

		'jquery': 'lib/jquery/jquery-1.9.1',
		'jquery-ui': 'lib/jquery/ui',
		'jquery-plugins': 'lib/jquery/plugins',
		'bs': 'lib/bootstrap',
		'socket.io': 'lib/socket.io',
		'moment': 'lib/moment/moment',
		'momentlang': 'lib/moment/lang',

		'domReady': 'lib/require/plugins/domReady',
		'text': 'lib/require/plugins/text',
		'async': 'lib/require/plugins/async',
		'goog': 'lib/require/plugins/goog',
		'Utils': 'lib/Utils',
		'Browser': 'lib/Browser',

		'lodash': 'lib/lodash',
		'underscore': 'lib/lodash',
		'backbone': 'lib/backbone/backbone',
		'backbone.queryparams': 'lib/backbone/queryparams',

		'knockout': 'lib/knockout/knockout-2.2.1',
		'knockout.extends': 'lib/knockout/extends',
		'knockout.mapping': 'lib/knockout/knockout.mapping',
		'knockout.postbox': 'lib/knockout/knockout-postbox',
		'knockout.bs': 'lib/knockout/knockout-bootstrap',

		'leaflet': 'lib/leaflet/leaflet',

		'highstock': 'lib/highstock',

		'jquery.ui.widget': 'lib/jquery/ui/widget',
		'jfileupload': 'lib/jquery/plugins/fileupload',
		'load-image': 'lib/jquery/plugins/fileupload/load-image',
		'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
		'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob',

		'noty': 'lib/jquery/plugins/noty/jquery.noty',
		'noty.layouts': 'lib/jquery/plugins/noty/layouts',
		'noty.themes': 'lib/jquery/plugins/noty/themes'
	}
});
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации не в каждый модуль, а только в этот файл
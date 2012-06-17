requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['./JSExtensions'],
	callback: function(module1, module2) {
		console.log('AMD depends loaded');
	},
	shim: {
		'socket':{
            deps: ['/socket.io/socket.io.js'],
            exports: 'socket'
		}
	},
	map: {
		'*': {
			'knockout': 'knockout-2.1.0',
			'knockout.mapping': 'knockout.mapping-latest'
		}
	}
});

require(
['require_plugins/domReady', 'jquery', 'knockout', 'Utils', 'socket', 'EventTypes', 'mvvm/GlobalParams', 'mvvm/i18n'], 
function(domReady, $, ko, Utils, socket, ET, GlobalParams, i18n) { domReady(function () {

	console.log('Dom Loaded');
	
	
});});
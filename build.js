#!/usr/bin/env node
var fs = require( 'fs' );
var requirejs = require('requirejs');

var config = {
	appDir: "public/",
    baseUrl: 'js',
	dir: "public-build",
	deps: ['JSExtensions'],
	map: {
		'*': {
			'knockout': 'knockout-2.1.0',
			'knockout.mapping': 'knockout.mapping-latest',
			'leaflet': 'leaflet_0.4.0'
		}
	},
    paths: {
        "jquery": "require-jquery",
		'domReady': 'require_plugins/domReady',
		'text': 'require_plugins/text',
		'async': 'require_plugins/async',
		'goog': 'require_plugins/goog'
    },
    modules: [
        {
            name: "appAMD",
            exclude: ["jquery"]
        }
    ]
};

requirejs.optimize(config, function (buildResponse) {
    //buildResponse is just a text output of the modules
    //included. Load the built file for the contents.
    //Use config.out to get the optimized file contents.
    //var contents = fs.readFileSync(config.out, 'utf8');
});
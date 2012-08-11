#!/usr/bin/env node
var fs = require('fs');
var requirejs = require('requirejs');

var config = {
    appDir: "public/",
    baseUrl: 'js',
    dir: "public-build",
    keepBuildDir: false,
    optimize: "uglify",
    uglify: {
        toplevel: false,
        ascii_only: false,
        beautify: false
    },
    optimizeCss: false, //Не трогаем css
    preserveLicenseComments: false, //Удаляем лицензионные комментарии
    removeCombined: true, //Удаляем файлы, которые заинлайнились в модуль

    paths: {
        'jquery': 'lib/jquery/jquery-1.8.0.min',
        'socket.io': 'lib/socket.io',
        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
        'leaflet': 'lib/leaflet/leaflet_0.4.4',

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
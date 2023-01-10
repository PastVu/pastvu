/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/*global requirejs:true*/
requirejs.config({
    baseUrl: '/js',
    urlArgs: '__=__',
    waitSeconds: 20,
    //deps: ['lib/JSExtensions'],
    //Shim позволит нам настроить зависимоти для скриптов, которые не содержат define, чтобы объявить себя модулем
    shim: {
        'highstock': {
            deps: [
                'jquery',
            ],
            exports: 'Highcharts',
        },
        'trumbowyg': {
            deps: [
                'jquery',
            ],
        },
        'tokenfield': {
            deps: [
                'jquery',
                'jquery-plugins/typeahead.bundle',
            ],
        },
    },
    map: {
        '*': {
            'css': 'lib/require/plugins/require-css/css',
        },
    },
    paths: {
        'tpl': '../tpl',
        'style': '../style',

        'm': 'module',

        'jquery': 'lib/jquery/jquery',
        'jquery-ui': 'lib/jquery/ui',
        'jquery-plugins': 'lib/jquery/plugins',
        'bs': 'lib/bootstrap',
        'socket.io': 'lib/socket.io.min',
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
        'underscore.string': 'lib/underscore.string',

        'knockout': 'lib/knockout/knockout',
        'knockout.extends': 'lib/knockout/extends',
        'knockout.mapping': 'lib/knockout/knockout.mapping',
        'knockout.postbox': 'lib/knockout/knockout-postbox',
        'knockout.bs': 'lib/knockout/knockout-bootstrap',

        'leaflet': 'lib/leaflet/leaflet.min',
        'leaflet-plugins': 'lib/leaflet/plugins',
        'leaflet-extends': 'lib/leaflet/extends',
        'turf': 'lib/turf.min',

        'trumbowyg': 'lib/trumbowyg/trumbowyg.min',
        'trumbowyg-plugins': 'lib/trumbowyg/plugins',
        'trumbowyg-langs': 'lib/trumbowyg/langs',

        'highstock': 'lib/highstock',

        //'jquery.ui.widget': 'lib/jquery/ui/widget',
        'jfileupload': 'lib/jquery/plugins/fileupload',
        'load-image': 'lib/jquery/plugins/fileupload/load-image',
        'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
        'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob',

        'noty': 'lib/jquery/plugins/noty/jquery.noty',
        'noty.layouts': 'lib/jquery/plugins/noty/layouts',
        'noty.themes': 'lib/jquery/plugins/noty/themes',

        'intl': 'intl/intl',
    },
});
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации не в каждый модуль, а только в этот файл

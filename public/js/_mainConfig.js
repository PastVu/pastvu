/*global requirejs:true, require:true, define:true*/
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

        'jquery': 'lib/jquery/jquery-1.8.3',
        'bs': 'lib/bootstrap',
        'socket.io': 'lib/socket.io',
        'moment': 'lib/moment',

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

        'knockout': 'lib/knockout/knockout-2.2.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping',
        'knockout.postbox': 'lib/knockout/knockout-postbox.min',

        'leaflet': 'lib/leaflet/leaflet',

        'jquery.ui.widget': 'lib/jquery/ui/jquery.ui.widget',
        'jquery.fileupload': 'lib/jquery/plugins/fileupload',
        'load-image': 'lib/jquery/plugins/fileupload/load-image',
        'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
        'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob'
    }
});
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации не в каждый модуль, а только в этот файл
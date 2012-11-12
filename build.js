#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    sys = require('util'),
    Step = require('step'),
    File = require("file-utils").File,
    requirejs = require('requirejs'),
    less = require('less'),
    jade = require('jade'),
    Utils = require('./commons/Utils.js'),

    jadeCompileOptions = {
        pretty: false
    },

    lessCompileOptions = {
        compress: true,
        yuicompress: true,
        optimization: 2,
        silent: false,
        path: 'public/style/',
        color: true,
        strictImports: true
    },

    requireBuildConfig = {
        appDir: "public/",
        baseUrl: 'js',
        dir: "public-build",
        keepBuildDir: false,
        optimize: "uglify",
        uglify: {
            toplevel: false,
            ascii_only: false,
            beautify: false,
            no_mangle: false
        },
        optimizeCss: "none", //Не трогаем css
        preserveLicenseComments: false, //Удаляем лицензионные комментарии
        removeCombined: true, //Удаляем файлы, которые заинлайнились в модуль
        inlineText: true, //Включать ли в модули контент, загруженный плагином text
        logLevel: 1,
        shim: {
            /*'underscore': {
             exports: '_'
             },*/
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
                ]//,
                //exports: ' Backbone.Router.arrayValueSplit'
            }
        },
        paths: {
            'tpl': '/tpl',
            'style': '/style',

            'm': 'module',

            'jquery': 'lib/jquery/jquery-1.8.2.min',
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
            //'underscore': 'lib/underscore-min',
            'backbone': 'lib/backbone/backbone-min',
            'backbone.queryparams': 'lib/backbone/queryparams',

            'knockout': 'lib/knockout/knockout-2.1.0',
            'knockout.mapping': 'lib/knockout/knockout.mapping',
            'knockout.postbox': 'lib/knockout/knockout-postbox.min',

            'leaflet': 'lib/leaflet/leaflet',

            'jquery.ui.widget': 'lib/jquery/ui/jquery.ui.widget',
            'jquery.fileupload': 'lib/jquery/plugins/fileupload',
            'load-image': 'lib/jquery/plugins/fileupload/load-image',
            'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
            'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob'
        },
        modules: [
            {
                name: "appMap",
                include: ['css!>>appMap']
            },
            {
                name: "appProfile"
            },
            {
                name: "appAdmin"
            }
        ]
    },
    jadeFiles = [],
    lessFiles = [];

function filesRecursive(files, prefix, excludeFolders, filter) {
    'use strict';
    var result = [];

    Object.keys(files).forEach(function (element, index, array) {
        if (Utils.isObjectType('object', files[element])) {
            if (!Utils.isObjectType('array', excludeFolders) || (Utils.isObjectType('array', excludeFolders) && excludeFolders.indexOf(element) === -1)) {
                Array.prototype.push.apply(result, filesRecursive(files[element], prefix + element + '/', excludeFolders, filter));
            }
        } else {
            result.push(prefix + element);
        }
    });

    if (filter) {
        result = result.filter(filter);
    }

    return result;
}

Step(
    /**
     * Находим клиентские jade-шаблоны и создаем плоский массив и создаем временную папку tpl для рендеренных
     */
     function searchJades() {
        var tplFolder = new File('./views/client'),
            tplFolderTemp = new File('./' + requireBuildConfig.appDir + 'tpl'),
            _this = this;

        tplFolder.list(function (e, files) {
            if (e) {
                console.dir(e);
                process.exit(1);
            }
            jadeFiles = filesRecursive(files, '', []);

            //Создаём временные директории и поддиректории для скомпилированных Jade-шаблонов
            tplFolderTemp.createDirectory();
            tplFolderTemp.removeOnExit(); //Удаляем временную папку скомпилированных шаблонов после завершения сборки
            Object.keys(files).forEach(function (element, index, array) {
                if (Utils.isObjectType('object', files[element])) {
                    new File ('./' + requireBuildConfig.appDir + 'tpl/' + element).createDirectory(_this.parallel());
                }
            });
        });


    },

    /**
     * Ищем less-файлы для компиляции и создаем плоский массив
     */
    function searchLess() {
        var lessFolder = new File('./' + requireBuildConfig.appDir + 'style'),
            _this = this;

        lessFolder.list(function (e, files) {
            if (e) {
                console.dir(e);
                process.exit(1);
            }
            lessFiles = filesRecursive(files, '', ['bootstrap', 'fonts'], function getOnlyLess(element) {
                return element.indexOf('.less') > -1;
            });
            _this();
        });
    },

    /**
     * Компилируем less и jade
     */
    function startCompile() {
        lessCompile(lessFiles, this.parallel());
        jadeCompile(jadeFiles, this.parallel());
    },

    /**
     * Собираем require
     */
        function requireBuild() {
        /*requirejs.optimize(requireBuildConfig, function (buildResponse) {
            //buildResponse is just a text output of the modules
            //included. Load the built file for the contents.
            //Use requireBuildConfig.out to get the optimized file contents.
            console.log('Build finished');
            this();
            //var contents = fs.readFileSync(requireBuildConfig.out, 'utf8');
        });*/
    },

    function removeUnnecessary() {
    }
);


function jadeCompile(files, done) {
    var name, input, output,
        fd,
        i = 0;

    next();

    function next() {
        name = files[i++];
        if (!name) {
            return done();
        }
        input = 'views/client/' + name;
        output = requireBuildConfig.appDir + 'tpl/' + name;
        fs.readFile(input, 'utf-8', render);
    }

    function render(e, data) {
        if (e) {
            sys.puts("jade readFile error: " + e.message);
            process.exit(1);
        }
        console.dir('Compiling Jade ' + input);
        var fn = jade.compile(data, jadeCompileOptions);
        fd = fs.openSync(output, "w");
        fs.writeSync(fd, fn(jadeCompileOptions), 0, "utf8");
        fs.closeSync(fd);
        next();
    }
}

function lessCompile(files, done) {
    var input, output,
        css, fd,
        i = 0;

    next();

    function next() {
        input = files[i++];
        if (!input) {
            return done();
        }
        output = lessCompileOptions.path + input.replace('.less', '.css');
        fs.readFile(lessCompileOptions.path + input, 'utf-8', parseLessFile);
    }

    function parseLessFile(e, data) {
        if (e) {
            sys.puts("Error to read less " + (lessCompileOptions.path + input) + " file: " + e.message);
            process.exit(1);
        }
        console.dir('Compiling LESS ' + lessCompileOptions.path + input);
        new (less.Parser)({
            paths: [lessCompileOptions.path + path.dirname(input)],
            optimization: lessCompileOptions.optimization,
            filename: path.basename(input),
            strictImports: lessCompileOptions.strictImports
        }).parse(data, function (err, tree) {
                if (err) {
                    less.writeError(err, lessCompileOptions);
                    process.exit(1);
                } else {
                    try {
                        css = tree.toCSS({
                            compress: lessCompileOptions.compress,
                            yuicompress: lessCompileOptions.yuicompress
                        });
                        if (output) {
                            fd = fs.openSync(output, "w");
                            fs.writeSync(fd, css, 0, "utf8");
                            fs.closeSync(fd);
                            next();
                        } else {
                            sys.print(css);
                        }
                    } catch (e) {
                        less.writeError(e, lessCompileOptions);
                        process.exit(2);
                    }
                }
            });
    }
}
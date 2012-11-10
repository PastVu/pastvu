#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    sys = require('util'),
    Step = require('step'),
    File = require("file-utils").File,
    requirejs = require('requirejs'),
    less = require('less'),
    jade = require('jade'),

    jadeCompileOptions = {
        pretty: false
    },

    lessCompileOptions = {
        compress: true,
        yuicompress: true,
        optimization: 2,
        silent: false,
        paths: ['./public/style'],
        color: true,
        strictImports: false
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


Step(
    /**
     * Находим клиентские jade-шаблоны и создаем временную папку tpl для рендеренных
     */
        function searchJades() {
        var tpl = new File('./views/client'),
            tpl_temp = new File('./' + requireBuildConfig.appDir + 'tpl');

        tpl.listFiles(this.parallel());
        tpl_temp.createDirectory(this.parallel());
        tpl_temp.removeOnExit();
    },

    /**
     * Создаем массив из имен jade-шаблонов
     * @param e Ошибка поиска jade-шаблонов
     * @param files Список  jade-шаблонов
     */
        function (e, files) {
        if (e) {
            console.dir(e);
            process.exit(1);
        }
        Object.keys(files).forEach(function (element, index, array) {
            jadeFiles.push(files[element].getName());
        });
        this();
    },

    /**
     * Ищем less-файлы для компиляции
     */
    function searchLess() {
        var lessFolder = new File('./' + requireBuildConfig.appDir + 'style');
        lessFolder.list(function (name, path) {
            return name.indexOf('.less') > -1;
        }, this);
    },

    /**
     * Создаем массив из less-файлов
     * @param e Ошибка поиска less-файлов
     * @param files Список  less-файлов
     */
        function (e, files) {
        if (e) {
            console.dir(e);
            process.exit(1);
        }
        Object.keys(files).forEach(function (element, index, array) {
            lessFiles.push(files[element]);
        });
        this();

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
        requirejs.optimize(requireBuildConfig, function (buildResponse) {
            //buildResponse is just a text output of the modules
            //included. Load the built file for the contents.
            //Use requireBuildConfig.out to get the optimized file contents.
            console.log('Build finished');
            this();
            //var contents = fs.readFileSync(requireBuildConfig.out, 'utf8');
        });
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

        var fn = jade.compile(data, jadeCompileOptions);
        fd = fs.openSync(output, "w");
        fs.writeSync(fd, fn(jadeCompileOptions), 0, "utf8");
        fs.closeSync(fd);
        next();
    }
}

function lessCompile(files, done) {
    console.log(9999);
    var input, output,
        css, fd,
        i = 0;

    next();

    function next() {
        input = files[i++];
        if (!input) {
            return done();
        }
        output = input.replace('.less', '.css');
        fs.readFile(input, 'utf-8', parseLessFile);
    }

    function parseLessFile(e, data) {
        if (e) {
            sys.puts("lessCompile error: " + e.message);
            process.exit(1);
        }

        new (less.Parser)({
            paths: lessCompileOptions.paths,
            optimization: lessCompileOptions.optimization,
            filename: input,
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
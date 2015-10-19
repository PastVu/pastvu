#!/usr/bin/env node
'use strict';

require('./bin/run');

var start = Date.now(),
    fs = require('fs'),
    path = require('path'),
    sys = require('util'),
    step = require('step'),
    requirejs = require('requirejs'),
    less = require('less'),
    Utils = require('./commons/Utils'),

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
        appDir: 'public/',
        baseUrl: 'js',
        dir: 'public-build',
        keepBuildDir: false,
        optimize: 'uglify2',
        uglify: {
            toplevel: false,
            ascii_only: false,
            beautify: false,
            no_mangle: false
        },
        // If using UglifyJS for script optimization, these config options can be
        // used to pass configuration values to UglifyJS.
        // https://github.com/mishoo/UglifyJS2
        // http://lisperator.net/uglifyjs/codegen
        // http://lisperator.net/uglifyjs/compress
        uglify2: {
            output: {
                beautify: false,
                max_line_len: 255000
            },
            compress: {
                sequences: true,
                properties: true,
                unused: true,
                join_vars: true,
                screw_ie8: true,
                global_defs: {
                    DEBUG: false
                }
            },
            warnings: false,
            mangle: true
        },
        skipDirOptimize: false, //Оптимизировать только модули (modules array), не трогая остальные js
        optimizeCss: 'none', //Не трогаем css
        preserveLicenseComments: false, //Удаляем лицензионные комментарии
        removeCombined: false, //Не удаляем файлы, которые заинлайнились в модуль
        inlineText: true, //Включать ли в модули контент, загруженный плагином text
        logLevel: 0,
        mainConfigFile: 'public/js/_mainConfig.js',
        modules: [
            {
                //Виртуальный модуль, содержащий общие модули, которые надо исключать из частных модулей
                name: 'commonExcludes',
                create: true, //set crecate: true if 'commonExcludes' is not a module that exists before a build
                include: [
                    'domReady', 'text', 'css', 'lib/require/plugins/require-css/normalize',
                    'jquery', 'underscore', 'knockout', 'knockout.mapping', 'lib/doT', 'moment',
                    'noty', 'noty.layouts', 'noty.themes/pastvu',
                    'Browser', 'Utils', 'socket', 'router', 'Params', 'globalVM',
                    'm/_moduleCliche', 'renderer',
                    'model/Photo', 'model/User', 'model/storage'
                ]
            },

            {
                name: '_mainConfig' //Компилируем конфигурацию, чтобы включить туда общую зависимость 'lib/JSExtensions'
            },
            {
                name: 'module/appMain',
                include: [
                    'socket.io', 'lib/doT',
                    'm/common/auth', 'm/common/top', 'm/common/foot',
                    'm/main/commentsFeed', 'm/main/mainPage', 'm/main/bottomPanel',
                    'm/map/map', 'm/map/marker', 'm/map/navSlider',
                    'm/photo/photo', 'm/photo/gallery',
                    'm/diff/newsList', 'm/diff/news',
                    'm/comment/comments',
                    'm/user/brief', 'm/user/profile', 'm/user/userPage'
                ],
                exclude: ['lib/require/plugins/require-css/normalize'] // normalize надо исключать, т.к. он почему-то попадает в сборку https://github.com/guybedford/require-css#basic-usage
            },
            {
                name: 'm/diff/about',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/user/comments',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/comment/hist',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/photo/hist',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/common/share',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/user/subscr',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/user/settings',
                exclude: ['commonExcludes', 'bs/collapse']
            },
            {
                name: 'm/user/manage',
                exclude: ['commonExcludes', 'bs/collapse']
            },
            {
                name: 'm/region/select',
                exclude: ['commonExcludes']
            },
            {
                name: 'm/common/reason',
                exclude: ['commonExcludes']
            }
        ]
    },
    lessFiles = [];

step(
    // Ищем less-файлы для компиляции и создаем плоский массив
    function searchLess() {
        var _this = this;

        Utils.walkParallel(path.normalize('./' + requireBuildConfig.appDir + 'style'), null, ['bs', 'fonts'], function (e, files) {
            if (e) {
                console.dir(e);
                process.exit(1);
            }
            lessFiles = Utils.filesListProcess(files, requireBuildConfig.appDir + 'style/', '', function getOnlyLess(element) {
                return ~element.indexOf('.less');
            });
            _this();
        });
    },

    //Компилируем less
    function startCompile() {
        lessCompile(lessFiles, this);
    },

    // Собираем require
    function requireBuild() {
        console.log('~~~ Start r.js build ~~~');
        var _this = this;
        requirejs.optimize(requireBuildConfig, function (/*buildResponse*/) {
            //buildResponse is just a text output of the modules
            //included. Load the built file for the contents.
            //Use requireBuildConfig.out to get the optimized file contents.
            //var contents = fs.readFileSync(requireBuildConfig.out, 'utf8');
            console.dir('Require build finished');
            _this();
        });
    },

    //Удаляем less из собранной директории
    function removeLessFromBuild() {
        var _this = this;

        console.dir('Removing Less from build');
        Utils.walkParallel(path.normalize(requireBuildConfig.dir + '/style'), function (e, files) {
            if (e) {
                console.dir(e);
                process.exit(1);
            }
            lessFiles = Utils.filesListProcess(files, null, '', function getOnlyLess(element) {
                return ~element.indexOf('.less');
            });
            lessFiles.forEach(function (item) {
                fs.unlinkSync(item);
            });
            _this();
        });
    },

    function finish(e) {
        if (e) {
            console.dir(e);
            process.exit(1);
        }
        console.dir('Build complete. Ok in ' + (Date.now() - start) / 1000 + 's');

        process.exit(0);
    }
);

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
            sys.puts('Error to read less ' + (lessCompileOptions.path + input) + ' file: ' + e.message);
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
                        fd = fs.openSync(output, 'w');
                        fs.writeSync(fd, css, 0, 'utf8');
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
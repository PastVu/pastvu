#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

require('./bin/run');

const start = Date.now();
const fs = require('fs');
const path = require('path');
const sys = require('util');
const step = require('step');
const requirejs = require('requirejs');
const less = require('less');
const Utils = require('./commons/Utils');

const lessCompileOptions = {
    compress: true,
    silent: false,
    path: 'public/style/',
    color: true,
    strictImports: true,
};

const requireBuildConfig = {
    appDir: 'public/',
    baseUrl: 'js',
    dir: 'public-build',
    keepBuildDir: false,
    optimize: 'none', // We will minify the built files after the optimizer runs.
    normalizeDirDefines: 'all', // Make define() calls normalized correctly to withstand post hoc minification.
    skipDirOptimize: false, //Оптимизировать только модули (modules array), не трогая остальные js
    optimizeCss: 'none', //Не трогаем css
    preserveLicenseComments: false, //Удаляем лицензионные комментарии
    removeCombined: false, //Не удаляем файлы, которые заинлайнились в модуль
    inlineText: true, //Включать ли в модули контент, загруженный плагином text
    logLevel: 0,
    mainConfigFile: 'public/js/_mainConfig.js',
    paths: {
        'lib/geocoordsparser': 'empty:', // Exclude geocoordsparser processing, as it fails on spread syntax (https://github.com/requirejs/r.js/issues/971)
    },
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
                'model/Photo', 'model/User', 'model/storage', 'intl',
            ],
        },

        {
            name: '_mainConfig', //Компилируем конфигурацию, чтобы включить туда общую зависимость 'lib/JSExtensions'
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
                'm/user/brief', 'm/user/profile', 'm/user/userPage',
                'errors/Application', 'errors/Timeout',
            ],
            exclude: ['lib/require/plugins/require-css/normalize'], // normalize надо исключать, т.к. он почему-то попадает в сборку https://github.com/guybedford/require-css#basic-usage
        },
        {
            name: 'm/diff/about',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/comments',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/photoUpload',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/comment/hist',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/photo/hist',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/common/share',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/subscr',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/settings',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/user/sessions',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/user/session',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/manage',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/region/select',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/common/reason',
            exclude: ['commonExcludes'],
        },
    ],
};
let lessFiles = [];

step(
    // Ищем less-файлы для компиляции и создаем плоский массив
    function searchLess() {
        Utils.walkParallel({ dir: path.normalize('./' + requireBuildConfig.appDir + 'style'), excludeFolders: ['bs', 'fonts'], onDone: (e, files) => {
            if (e) {
                console.dir(e);
                process.exit(1);
            }

            lessFiles = Utils.filesListProcess(files, requireBuildConfig.appDir + 'style/', '', function getOnlyLess(element) {
                return ~element.indexOf('.less');
            });
            this();
        } });
    },

    //Компилируем less
    function startCompile() {
        lessCompile(lessFiles, this);
    },

    // Собираем require
    function requireBuild() {
        console.log('~~~ Start r.js build ~~~');
        requirejs.optimize(requireBuildConfig, (/*buildResponse*/) => {
            //buildResponse is just a text output of the modules
            //included. Load the built file for the contents.
            //Use requireBuildConfig.out to get the optimized file contents.
            //var contents = fs.readFileSync(requireBuildConfig.out, 'utf8');
            console.dir('Require build finished');
            this();
        });
    },

    //Удаляем less из собранной директории
    function removeLessFromBuild() {
        console.dir('Removing Less from build');
        Utils.walkParallel({ dir: path.normalize(requireBuildConfig.dir + '/style'), onDone: (e, files) => {
            if (e) {
                console.dir(e);
                process.exit(1);
            }

            lessFiles = Utils.filesListProcess(files, null, '', function getOnlyLess(element) {
                return ~element.indexOf('.less');
            });
            lessFiles.forEach(item => {
                fs.unlinkSync(item);
            });
            this();
        } });
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
    let input;
    let output;
    let fd;
    let i = 0;

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

        less.render(data, {
            paths: [lessCompileOptions.path + path.dirname(input)],
            filename: path.basename(input),
            strictImports: lessCompileOptions.strictImports,
            compress: lessCompileOptions.compress,
        }).then(result => {
            try {
                const css = result.css;

                if (css) {
                    fd = fs.openSync(output, 'w');
                    fs.writeSync(fd, css, 0, 'utf8');
                    fs.closeSync(fd);
                }

                next();
            } catch (err) {
                console.error(err, lessCompileOptions);
                process.exit(1);
            }
        }, err => {
            if (!lessCompileOptions.silent) {
                console.error(err.toString({
                    stylize: lessCompileOptions.color && less.lesscHelper.stylize,
                }));
            }

            process.exit(1);
        });
    }
}

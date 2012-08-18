#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    sys = require('util'),
    requirejs = require('requirejs'),
    less = require('less'),

    lessPreBuildToCompile = [
        './public/style/map_main',
        './public/style/jquery.toast'
    ],

    rJSConfig = {
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
        optimizeCss: "none", //Не трогаем css
        preserveLicenseComments: false, //Удаляем лицензионные комментарии
        removeCombined: true, //Удаляем файлы, которые заинлайнились в модуль
        shim: {
            'jade': {
                exports: 'jade'
            }
        },
        paths: {
            'tpl': '../tpl',
            'style': '../style',

            'jquery': 'lib/jquery/jquery-1.8.0.min',
            'socket.io': 'lib/socket.io',

            'domReady': 'lib/require/plugins/domReady',
            'text': 'lib/require/plugins/text',
            'css': 'lib/require/plugins/css',
            'css.api': 'lib/require/plugins/css.api',
            'css.pluginBuilder': 'lib/require/plugins/css.pluginBuilder',
            'async': 'lib/require/plugins/async',
            'goog': 'lib/require/plugins/goog',
            'Utils': 'lib/Utils',
            'Browser': 'lib/Browser',

            'jade': 'lib/jade',

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
    };

lessCompile(lessPreBuildToCompile, function () {
    requirejs.optimize(rJSConfig, function (buildResponse) {
        //buildResponse is just a text output of the modules
        //included. Load the built file for the contents.
        //Use rJSConfig.out to get the optimized file contents.
        console.log('Build finished');
        //var contents = fs.readFileSync(rJSConfig.out, 'utf8');
    });
});

function lessCompile(files, done) {
    var input, output,
        lessOptions = {
            compress: true,
            yuicompress: true,
            optimization: 2,
            silent: false,
            paths: ['./public/style'],
            color: true,
            strictImports: false
        },
        css, fd,
        i = 0;

    next();

    function next() {
        input = files[i++];
        if (!input) {
            return done();
        }
        output = input + '.css';
        input = input + '.less';
        fs.readFile(input, 'utf-8', parseLessFile);
    }

    function parseLessFile(e, data) {
        if (e) {
            sys.puts("lessCompile error: " + e.message);
            process.exit(1);
        }

        new (less.Parser)({
            paths: lessOptions.paths,
            optimization: lessOptions.optimization,
            filename: input,
            strictImports: lessOptions.strictImports
        }).parse(data, function (err, tree) {
                if (err) {
                    less.writeError(err, lessOptions);
                    process.exit(1);
                } else {
                    try {
                        css = tree.toCSS({
                            compress: lessOptions.compress,
                            yuicompress: lessOptions.yuicompress
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
                        less.writeError(e, lessOptions);
                        process.exit(2);
                    }
                }
            });
    }
}
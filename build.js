#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    sys = require('util'),
    Step = require('step'),
    File = require("file-utils").File,
    Utils = require('./commons/Utils.js'),
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
            beautify: true
        },
        optimizeCss: "none", //Не трогаем css
        preserveLicenseComments: false, //Удаляем лицензионные комментарии
        removeCombined: true, //Удаляем файлы, которые заинлайнились в модуль
        inlineText: true, //Включать ли в модули контент, загруженный плагином text
        logLevel: 1,
        shim: {
        },
        paths: {
            'tpl': '../tpl_temp',
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

            'jade': 'lib/jade_dumb',

            'knockout': 'lib/knockout/knockout-2.1.0',
            'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
            'leaflet': 'lib/leaflet/leaflet_0.4.4',

            'jquery.datepick': 'lib/jquery/plugins/datepick/jquery.datepick',
            'jquery.datepick.lang': 'lib/jquery/plugins/datepick/jquery.datepick.lang',
            'jquery.ui': 'lib/jquery/ui/jquery-ui-1.8.22.custom.min',
            'jquery.jgrid': 'lib/jquery/plugins/grid/jquery.jqGrid.min',
            'jquery.jgrid.en': 'lib/jquery/plugins/grid/i18n/grid.locale-en'
        },
        stubModules: ['jade'],
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

    function searchJades() {
        var tpl = new File('./' + requireBuildConfig.appDir + 'tpl'),
            tpl_temp = new File('./' + requireBuildConfig.appDir + 'tpl_temp');

        tpl.listFiles (this.parallel());
        tpl_temp.createDirectory(this.parallel());
        tpl_temp.removeOnExit();
    },

    function searchLess(e, files) {
        if (e) {
            console.dir(e); process.exit(1);
        }
        Object.keys(files).forEach(function(element, index, array){
            jadeFiles.push(files[element].getPath());
        });

        var lessFolder = new File('./' + requireBuildConfig.appDir + 'style');
        lessFolder.list(function (name, path){
            return name.indexOf('.less')>-1;
        }, this);
    },

    function startCompile(e, files) {
        if (e) {
            console.dir(e); process.exit(1);
        }
        Object.keys(files).forEach(function(element, index, array){
            lessFiles.push(files[element]);
        });

        lessCompile(lessFiles, this.parallel());
        jadeCompile(jadeFiles, this.parallel());
    },

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
        (new File('./' + requireBuildConfig.dir + 'tpl')).remove();
        (new File('./' + requireBuildConfig.dir + 'tpl_temp')).remove();
    }
);



function jadeCompile(files, done) {
    var input, output,
        fd,
        i = 0;
    next();

    function next() {
        input = files[i++];
        if (!input) {
            return done();
        }
        output = input.replace('tpl', 'tpl_temp');
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
'use strict'; // eslint-disable-line strict

module.exports = function (grunt) {
    require('./bin/run');
    const path = require('path');
    const Utils = require('./commons/Utils');
    const env = grunt.option('env') || 'production'; // Например, --env testing
    const upperDir = path.normalize(path.resolve('../') + '/');
    const targetDir = path.normalize(upperDir + 'appBuild/');
    const babelConfig = require('./babel/server.config');
    const babelFiles = require('./babel/server.files');
    const hash = Utils.randomString(5);

    grunt.file.defaultEncoding = 'utf8';

    // Project configuration
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        mkdir: {
            target: {
                options: {
                    create: [targetDir]
                }
            }
        },
        clean: {
            options: {
                force: true // This overrides grunt.file.delete from blocking deletion of folders outside cwd
            },
            target: {
                // Очищаем целевую директорию (кроме вложенной папки node_modules)
                src: [targetDir + '/*'/* , '!' + targetDir + '/node_modules' */]
            },
            publicTpl: {
                // Очищаем директорию скомпиленных tpl
                src: ['public/tpl']
            }
        },
        exec: {
            buildjs: {
                command: 'node build.js',
                stdout: true,
                stderr: true
            },
            npm: {
                command: 'npm --production install',
                cwd: targetDir,
                stdout: true,
                stderr: true
            },
            movePublic: {
                command: `mv public-build ${targetDir}public`,
                stdout: true,
                stderr: true
            }
        },
        concat: {
            options: {
                separator: ';',
                stripBanners: true,
                banner: '/**\n' +
                ' * Hello, inquiring mind!\n' +
                ' * This is <%= pkg.name %> application of <%= pkg.description %>.\n' +
                ' * Version: <%= pkg.version %>, <%= grunt.template.today("dd.mm.yyyy") %>\n' +
                ' * Author: <%= pkg.author.name %> <<%=pkg.author.email%>>\n' +
                ' */\n'
            },
            main: {
                files: {
                    'public-build/js/module/appMain.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appMain.js'
                    ],
                    'public-build/js/module/appAdmin.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appAdmin.js'
                    ]
                }
            }
        },
        'string-replace': {
            baseurl: {
                options: {
                    replacements: [
                        { pattern: /__=__/ig, replacement: `__=${hash}` }
                    ]
                },
                files: {
                    'public-build/js/_mainConfig.js': 'public-build/js/_mainConfig.js'
                }
            }
        },
        copy: {
            main: {
                files: [
                    {
                        expand: true,
                        src: [
                            'app/**', 'bin/**', 'basepatch/**', 'commons/**', 'misc/watermark/**',
                            'controllers/systemjs.js', 'npm-shrinkwrap.json',
                            'config/@(client|server|browsers.config|default.config).js', 'config/package.json'
                        ],
                        dest: targetDir
                    },
                    {
                        expand: true,
                        src: ['views/app.pug', 'views/api/**', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**'],
                        dest: targetDir
                    },
                    // {expand: true, cwd: 'public-build', src: ['**'], dest: targetDir + 'public'},
                    {
                        expand: true,
                        src: ['api.js', 'log4js.json', 'package.json', './README'],
                        dest: targetDir
                    }
                ]
            }
        },
        pug: {
            compileTpls: {
                options: {
                    data: {
                        config: { env, hash }, pretty: false
                    }
                },
                files: [
                    { expand: true, cwd: 'views/module/', src: '**/*.pug', dest: 'public/tpl/' }
                ]
            },
            compileMainPugs: {
                options: {
                    data(dest/* , src */) {
                        const name = dest.replace(/.*\/(?:app)?(.*)\.html/i, '$1');
                        grunt.log.write('appName: ' + name + '. ');
                        return { appName: name, config: { env, hash }, pretty: false };
                    }
                },
                files: [
                    {
                        expand: true,
                        cwd: targetDir + 'views/',
                        ext: '.html',
                        src: 'status/404.pug',
                        dest: targetDir + 'views/html/'
                    }
                ]
            }
        },
        babel: {
            options: Object.assign({}, babelConfig),
            dist: {
                files: [
                    {
                        expand: true,
                        src: babelFiles.only,
                        dest: targetDir
                    }
                ]
            }
        },
        compress: {
            main: {
                options: {
                    archive: upperDir + 'app<%= pkg.version %>.zip',
                    mode: 'zip',
                    level: 9,
                    forceUTC: true,
                    comment: 'This PastVu application builded and compressed with Grunt'
                },
                files: [
                    { expand: true, cwd: targetDir, src: ['**/*'/* , '!node_modules*' */], dest: 'app' }
                ]
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-pug');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-compress');
    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-string-replace');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-mkdir');
    grunt.loadNpmTasks('grunt-babel');

    // Default task(s).
    grunt.registerTask('default', [
        'mkdir:target',
        'clean:target',
        'pug:compileTpls',
        'exec:buildjs',
        'string-replace',
        'concat',
        'copy:main',
        'babel',
        'exec:movePublic',
        'pug:compileMainPugs',
        'clean:publicTpl',
        'writeBuildParams',
        'exec:npm',
        'compress'
    ]);

    // Записываем параметры сборки, например hash, из которых запуск в prod возьмет данные
    grunt.registerTask('writeBuildParams', function () {
        const buildString = JSON.stringify({ hash });

        grunt.file.write(targetDir + 'build.json', buildString);
        grunt.log.writeln('Build json: ' + buildString);
        grunt.log.write('env: ' + env + '. ');
    });
};
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

module.exports = function (grunt) {
    require('./bin/run');

    const fs = require('node:fs');
    const path = require('path');
    const Utils = require('./commons/Utils');
    const env = grunt.option('env') || 'production'; // Например, --env testing
    const currentDir = path.normalize(path.resolve('./') + '/');
    const targetDir = path.normalize(currentDir + 'appBuild/');
    const babelConfig = require('./babel/server.config');
    const hash = Utils.randomString(5);

    grunt.file.defaultEncoding = 'utf8';

    // Project configuration
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        clean: {
            target: [targetDir + '/*'],
            publicTpl: ['public/tpl'],
            publicCss: ['public/style/**/*.css'],
        },
        exec: {
            buildjs: {
                command: 'node build.js',
                stdout: true,
                stderr: true,
            },
            npm: {
                command: 'npm --only=production install',
                cwd: targetDir,
                stdout: true,
                stderr: true,
            },
        },
        uglify: {
            options: {
                sourceMap: true,
                output: {
                    comments: false,
                },
            },
            publicApps: {
                options: {
                    banner: '/**\n' +
                    ' * Hello, inquiring mind!\n' +
                    ' * This is <%= pkg.name %> application of <%= pkg.description %>.\n' +
                    ' * Explore its source code and contribute at <%= pkg.homepage %>\n' +
                    ' * Version: <%= pkg.version %>, built <%= grunt.template.today("dd.mm.yyyy") %>\n' +
                    ' * Author: <%= pkg.author.name %> <<%=pkg.author.email%>>\n' +
                    ' */\n',
                },
                files: {
                    'public-build/js/module/appMain.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appMain.js',
                    ],
                    'public-build/js/module/appAdmin.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appAdmin.js',
                    ],
                },
            },
            publicJs: {
                files: [{
                    expand: true,
                    src: ['**/*.js', '!**/*.min.js', '!module/appMain.js', '!module/appAdmin.js'],
                    dest: 'public-build/js',
                    cwd: 'public-build/js',
                }],
            },
        },
        pug: {
            compileTpls: {
                options: {
                    data: {
                        config: { env, hash }, pretty: false,
                    },
                },
                files: [
                    { expand: true, cwd: 'views/module/', src: '**/*.pug', dest: 'public/tpl/' },
                ],
            },
            compileMainPugs: {
                options: {
                    data(dest/* , src */) {
                        const name = dest.replace(/.*\/(?:app)?(.*)\.html/i, '$1');

                        grunt.log.write('appName: ' + name + '. ');

                        // Build-time fallback for the i18n helper: this HTML is the
                        // static fallback (e.g. nginx error_page); runtime renders
                        // go through Express with a real t() from commons/i18n.
                        return { appName: name, config: { env, hash }, pretty: false, t: s => s };
                    },
                },
                files: [
                    {
                        expand: true,
                        cwd: targetDir + 'views/',
                        ext: '.html',
                        src: 'status/404.pug',
                        dest: targetDir + 'views/html/',
                    },
                ],
            },
        },
        babel: {
            options: { ...babelConfig },
            dist: {
                files: [
                    {
                        expand: true,
                        src: [ // May be array of regexp, or github.com/isaacs/node-glob
                            '@(app|downloader|uploader|sitemap|notifier|worker).js',
                            'controllers/!(systemjs|api|apilog).js',
                            'commons/Utils.js',
                            'models/*.js',
                            'app/*.js',
                            'app/webapi/*.js',
                            'app/errors/*.js',
                        ],
                        dest: targetDir,
                    },
                ],
            },
        },

    });

    grunt.loadNpmTasks('grunt-contrib-pug');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-babel');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    // Build.
    grunt.registerTask('default', [
        'mkdir',
        'clean:target',
        'pug:compileTpls',
        'exec:buildjs',
        'replaceBaseurl',
        'uglify:publicApps',
        'uglify:publicJs',
        'copy',
        'babel',
        'movePublic',
        'pug:compileMainPugs',
        'clean:publicTpl',
        'writeBuildParams',
        //'exec:npm',
    ]);

    grunt.registerTask('mkdir', 'Create the build directory', () => {
        fs.mkdirSync(targetDir, { recursive: true });
    });

    grunt.registerMultiTask('clean', 'Remove generated files', function () {
        for (const pattern of this.data) {
            for (const match of fs.globSync(pattern)) {
                fs.rmSync(match, { recursive: true, force: true });
            }
        }
    });

    grunt.registerTask('replaceBaseurl', 'Add the build hash to asset URLs', () => {
        const file = 'public-build/js/_mainConfig.js';
        const source = fs.readFileSync(file, 'utf8');

        fs.writeFileSync(file, source.replace(/__=__/ig, `__=${hash}`));
    });

    grunt.registerTask('movePublic', 'Move public assets into the build directory', () => {
        fs.renameSync('public-build', path.join(targetDir, 'public'));
    });

    // Copy source files into the build directory, preserving paths.
    grunt.registerTask('copy', 'Copy source files into the build directory', () => {
        const patterns = [
            'app/**', 'bin/**', 'migrations/**', 'commons/**', 'misc/watermark/**',
            'controllers/systemjs.js', 'npm-shrinkwrap.json',
            'config/@(client|server|log4js|migrate-mongo|default.config).js',
            'config/package.json',
            'views/app.pug', 'views/api/**', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**',
            'api.js', 'package.json', 'README',
        ];

        for (const pattern of patterns) {
            for (const match of fs.globSync(pattern)) {
                if (fs.statSync(match).isDirectory()) {
                    continue;
                }

                const dest = path.join(targetDir, match);

                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.cpSync(match, dest);
            }
        }
    });

    // Записываем параметры сборки, например hash, из которых запуск в prod возьмет данные
    grunt.registerTask('writeBuildParams', () => {
        const buildString = JSON.stringify({ hash });

        grunt.file.write(targetDir + 'build.json', buildString);
        grunt.log.writeln('Build json: ' + buildString);
        grunt.log.write('env: ' + env + '. ');
    });
};

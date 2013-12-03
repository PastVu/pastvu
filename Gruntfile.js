'use strict';

module.exports = function (grunt) {
	global.appVar = {};

	var path = require('path'),
		Utils = require('./commons/Utils.js'),
		land = grunt.option('land') || 'prod', //Например, --land test
		upperDir = path.normalize(path.resolve('../') + '/'),
		targetDir = path.normalize(upperDir + 'appBuild/'),
		appHash = Utils.randomString(5);

	grunt.file.defaultEncoding = 'utf8';

	// Project configuration.
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
				force: true //This overrides grunt.file.delete from blocking deletion of folders outside cwd
			},
			target: {
				//Очищаем целевую директорию кроме вложенной папки node_modules
				src: [targetDir + '/*'/*, '!' + targetDir + '/node_modules'*/]
			},
			publicTpl: {
				//Очищаем директорию скомпиленных tpl
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
					'public-build/js/module/appMain.js': ['public-build/js/lib/require/require.js', 'public-build/js/_mainConfig.js', 'public-build/js/module/appMain.js'],
					'public-build/js/module/appAdmin.js': ['public-build/js/lib/require/require.js', 'public-build/js/_mainConfig.js', 'public-build/js/module/appAdmin.js']
				}
			}
		},
		copy: {
			main: {
				files: [
					{expand: true, src: ['basepatch/**', 'commons/**', 'controllers/**', 'models/**', 'misc/watermark/**'], dest: targetDir},
					{expand: true, src: ['views/app.jade', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**'], dest: targetDir},
					//{expand: true, cwd: 'public-build', src: ['**'], dest: targetDir + 'public'},
					{expand: true, src: ['app.js', 'config.json', 'log4js.json', 'package.json', 'uploader.js', './README'], dest: targetDir}
				]
			},
			imagemagick: {
				files: [
					{expand: true, src: ['node_modules/imagemagick/**'], dest: targetDir}
				]
			}
		},
		rename: {
			movePublic: {
				src: ['public-build'],
				dest: targetDir + 'public'
			}
		},
		jade: {
			compileTpls: {
				options: {
					data: {
						appLand: land, appHash: appHash, pretty: false
					}
				},
				files: [
					{expand: true, cwd: 'views/module/', src: '**/*.jade', dest: 'public/tpl/'}
				]
			},
			compileMainJades: {
				options: {
					data: function (dest, src) {
						var name = dest.replace(/.*\/(?:app)?(.*)\.html/i, '$1');
						grunt.log.write('appName: ' + name + '. ');
						return {appName: name, appLand: land, appHash: appHash, pretty: false};
					}
				},
				files: [
					{expand: true, cwd: targetDir + 'views/', ext: 'Main.html', src: 'app.jade', dest: targetDir + 'views/html/'},
					{expand: true, cwd: targetDir + 'views/', ext: 'Admin.html', src: 'app.jade', dest: targetDir + 'views/html/'},
					{expand: true, cwd: targetDir + 'views/', ext: '.html', src: 'status/*.jade', dest: targetDir + 'views/html/'}
				]
			}
		},
		compress: {
			main: {
				options: {
					archive: upperDir + 'app<%= pkg.version %>.zip',
					mode: 'zip',
					level: 9
				},
				files: [
					{expand: true, cwd: targetDir, src: ['**/*'/*, '!node_modules*//**//**'*/], dest: 'app'}
				]
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-jade');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-contrib-requirejs');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-rename');
	grunt.loadNpmTasks('grunt-mkdir');

	// Default task(s).
	grunt.registerTask('default', [
		'mkdir:target',
		'clean:target',
		'jade:compileTpls',
		'exec:buildjs',
		'concat',
		'copy:main',
		'rename:movePublic',
		'jade:compileMainJades',
		'clean:publicTpl',
		'writeBuildParams',
		'copy:imagemagick',
		//'exec:npm',
		'compress'
	]);

	//Записываем параметры сборки, например appHash, из которых запуск в prod возьмет даные
	grunt.registerTask('writeBuildParams', function () {
		var buildString = JSON.stringify({appHash: appHash});

		grunt.file.write(targetDir + 'build.json', buildString);
		grunt.log.writeln('Build json: ' + buildString);
		grunt.log.write('appLand: ' + land + '. ');
	});
};
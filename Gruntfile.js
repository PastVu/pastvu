module.exports = function (grunt) {
	var path = require('path'),
		upperDir = path.normalize(path.resolve('../') + '/'),
		targetDir = path.normalize(upperDir + 'appBuild/');

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		mkdir: {
			all: {
				options: {
					create: [targetDir]
				}
			}
		},
		clean: {
			options: {
				force: true //This overrides grunt.file.delete from blocking deletion of folders outside cwd
			},
			publicTarget: [targetDir + 'public']
		},
		exec: {
			buildjs: {
				command: 'node build.js',
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
		rename: {
			moveThis: {
				src: ['public-build'],
				dest: targetDir + 'public'
			}
		},
		copy: {
			main: {
				files: [
					{expand: true, src: ['commons/**', 'controllers/**', 'models/**', 'misc/watermark/**'], dest: targetDir},
					//{expand: true, cwd: 'public-build', src: ['**'], dest: targetDir + 'public'},
					{expand: true, src: ['app.js', 'build.js', 'config.json', 'log4js.json', 'package.json', 'uploader.js'], dest: targetDir}
				]
			}
		},
		compress: {
			main: {
				options: {
					archive: upperDir + 'app.tgz',
					mode: 'tgz'
				},
				files: [
					{cwd: targetDir, src: ['**/*'], dest: 'app/'}
				]
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-contrib-requirejs');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-rename');
	grunt.loadNpmTasks('grunt-mkdir');

	// Default task(s).
	grunt.registerTask('default', ['mkdir', 'clean', 'exec', 'concat', 'rename', 'copy',  'compress']);
};
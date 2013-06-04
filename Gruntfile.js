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
		copy: {
			main: {
				files: [
					{expand: true, src: ['commons/**', 'controllers/**', 'models/**', 'misc/watermark/**'], dest: targetDir}
				]
			}
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
					' * This is application of <%= pkg.description %>.\n' +
					' * Version: <%= pkg.version %>, <%= grunt.template.today("dd.mm.yyyy") %>\n' +
					' * Author: <%= pkg.author %>\n' +
					' */\n'
			},
			main: {
				files: {
					'public-build/js/module/appMain.js': ['public-build/js/lib/require/require.js', 'public-build/js/_mainConfig.js', 'public-build/js/module/appMain.js'],
					'public-build/js/module/appAdmin.js': ['public-build/js/lib/require/require.js', 'public-build/js/_mainConfig.js', 'public-build/js/module/appAdmin.js']
				}
			}
		},
		compress: {
			main: {
				options: {
					archive: '../archive.tgz',
					mode: 'tgz'
				},
				files: [
					{cwd: targetDir, src: ['**/*'], dest: 'app/'}
				]
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-contrib-requirejs');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-mkdir');

	// Default task(s).
	grunt.registerTask('default', ['mkdir', 'copy', /*'exec', 'concat',*/ 'compress']);
};
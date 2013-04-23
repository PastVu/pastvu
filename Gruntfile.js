module.exports = function(grunt) {

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		concat: {
			options: {
				separator: ';',
				stripBanners: true,
				banner: '/**\n' +
					' * Hello, inquiring mind!\n' +
					' * This is application of <%= pkg.description %>.\n' +
					' * Version: <%= pkg.version %>, <%= grunt.template.today("dd.mm.yyyy") %>\n' +
					' * Author: Paul Klimashkin\n' +
					' */\n'
			},
			dist: {
				src: ['public-build/js/lib/require/require.js', 'public-build/js/_mainConfig.js', 'public-build/js/appMain.js'],
				dest: 'public-build/js/appMain.js'
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-concat');

	// Default task(s).
	grunt.registerTask('default', ['concat']);
};
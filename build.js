#!/usr/bin/env node
var start = Date.now(),
	fs = require('fs'),
	path = require('path'),
	sys = require('util'),
	step = require('step'),
	File = require('file-utils').File,
	requirejs = require('requirejs'),
	less = require('less'),
	Utils = require('./commons/Utils.js'),

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
		appDir: "public/",
		baseUrl: 'js',
		dir: "public-build",
		keepBuildDir: false,
		optimize: "none",
		uglify: {
			toplevel: false,
			ascii_only: false,
			beautify: false,
			no_mangle: false
		},
		//If using UglifyJS for script optimization, these config options can be
		//used to pass configuration values to UglifyJS.
		//https://github.com/mishoo/UglifyJS2
		//http://lisperator.net/uglifyjs/codegen
		//http://lisperator.net/uglifyjs/compress
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
		optimizeCss: "none", //Не трогаем css
		preserveLicenseComments: false, //Удаляем лицензионные комментарии
		removeCombined: false, //Не удаляем файлы, которые заинлайнились в модуль
		inlineText: true, //Включать ли в модули контент, загруженный плагином text
		logLevel: 0,
		mainConfigFile: 'public/js/_mainConfig.js',
		modules: [
			{
				name: "_mainConfig" //Компилируем конфигурацию, чтобы включить туда общую зависимость 'lib/JSExtensions'
			},
			{
				name: "module/appMain",
				include: [
					'socket.io',
					'm/common/auth', 'm/common/top', 'm/common/foot',
					'm/main/commentsFeed', 'm/main/mainPage', 'm/main/bottomPanel',
					'm/map/map', 'm/map/marker', 'm/map/navSlider',
					'm/photo/photo', 'm/photo/gallery',
					'm/diff/newsList', 'm/diff/news',
					'm/comment/comments', 'm/comment/hist',
					'm/user/brief', 'm/user/comments', 'm/user/profile', 'm/user/settings', 'm/user/userPage'
				]
			}/*,
			{
				name: "appMap",
				include: ['m/auth', 'm/top', 'm/map/map']
			},
			{
				name: "appUser",
				include: ['m/auth', 'm/top', 'm/user/brief']
			},
			{
				name: "m/photo/gallery",
				exclude: [
					'underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage',
					'text', 'css'
				]
			},
			{
				name: "appPhoto",
				include: ['m/auth', 'm/top', 'm/photo/photo']
			}*/
		]
	},
	lessFiles = [];

step(
	//Ищем less-файлы для компиляции и создаем плоский массив
	function searchLess() {
		var lessFolder = new File('./' + requireBuildConfig.appDir + 'style'),
			_this = this;

		lessFolder.list(function (e, files) {
			if (e) {
				console.dir(e);
				process.exit(1);
			}
			lessFiles = Utils.filesRecursive(files, '', ['bootstrap', 'fonts'], function getOnlyLess(element) {
				return element.indexOf('.less') > -1;
			});
			_this();
		});
	},

	//Компилируем less
	function startCompile() {
		lessCompile(lessFiles, this);
	},

	//Собираем require
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
		var styleFolder = new File(requireBuildConfig.dir + '/style'),
			_this = this;

		console.dir('Removing Less from build');
		styleFolder.list(function (e, files) {
			if (e) {
				console.dir(e);
				process.exit(1);
			}
			lessFiles = Utils.filesRecursive(files, requireBuildConfig.dir + '/style/', null, function getOnlyLess(element) {
				return element.indexOf('.less') > -1;
			});
			lessFiles.forEach(function (item) {
				(new File(item)).remove(_this.parallel());
			});
		});
	},

	function finish(e) {
		if (e) {
			console.dir(e);
			process.exit(1);
		}
		console.dir('Build complete. Ok in ' + (Date.now() - start) / 1000 + 's');
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
			sys.puts("Error to read less " + (lessCompileOptions.path + input) + " file: " + e.message);
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
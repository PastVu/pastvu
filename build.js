#!/usr/bin/env node
var start = Date.now(),
	fs = require('fs'),
	path = require('path'),
	sys = require('util'),
	step = require('step'),
	File = require('file-utils').File,
	requirejs = require('requirejs'),
	less = require('less'),
	jade = require('jade'),
	_ = require('lodash'),
	Utils = require('./commons/Utils.js'),
	version = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')).version,

	jadeCompileOptions = {
		pretty: false,
		pageTitle: 'OldMos51',
		appLand: 'prod',
		appHash: Utils.randomString(10),
		appVersion: version
	},

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
		optimize: "uglify2",
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
				name: "appMain",
				include: [
					'm/common/auth', 'm/common/top',
					'm/main/commentsRibbon', 'm/main/mainPage',
					'm/map/map', 'm/map/marker', 'm/map/navSlider',
					'm/photo',
					'm/user/brief', 'm/user/comments', 'm/user/gallery', 'm/user/menu', 'm/user/profile', 'm/user/settings', 'm/user/userPage'
				]
			}/*,
			{
				name: "appMap",
				include: ['m/auth', 'm/top', 'm/map/map']
			},
			{
				name: "appUser",
				include: ['m/auth', 'm/top', 'm/user/brief', 'm/user/menu']
			},
			{
				name: "m/user/gallery",
				exclude: [
					'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'm/Photo', 'm/storage',
					'text', 'css'
				]
			},
			{
				name: "appPhoto",
				include: ['m/auth', 'm/top', 'm/photo/photo']
			}*/
		]
	},
	jadeFiles = [],
	lessFiles = [];

step(
	//Находим клиентские jade-шаблоны и создаем плоский массив и создаем временную папку tpl для рендеренных
	function searchJades() {
		var tplFolder = new File('./views/client'),
			tplFolderTemp = new File('./' + requireBuildConfig.appDir + 'tpl'),
			_this = this;

		tplFolder.list(function (e, files) {
			if (e) {
				console.dir(e);
				process.exit(1);
			}
			jadeFiles = Utils.filesRecursive(files, '');

			//Создаём временные директории и поддиректории для скомпилированных Jade-шаблонов
			tplFolderTemp.createDirectory();
			tplFolderTemp.removeOnExit(); //Удаляем временную папку скомпилированных шаблонов после завершения сборки
			Object.keys(files).forEach(function (element, index, array) {
				if (Utils.isType('object', files[element])) {
					new File('./' + requireBuildConfig.appDir + 'tpl/' + element).createDirectory(_this.parallel());
				}
			});
			_this.parallel()();
		});
	},

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

	//Компилируем less и jade
	function startCompile() {
		lessCompile(lessFiles, this.parallel());
		jadeCompile(jadeFiles, 'views/client/', requireBuildConfig.appDir + 'tpl/', this.parallel());
	},

	//Собираем require
	function requireBuild() {
		console.log('~~~ Start r.js build ~~~');
		var _this = this;
		requirejs.optimize(requireBuildConfig, function (buildResponse) {
			//buildResponse is just a text output of the modules
			//included. Load the built file for the contents.
			//Use requireBuildConfig.out to get the optimized file contents.
			//var contents = fs.readFileSync(requireBuildConfig.out, 'utf8');
			console.log('Require build finished');
			_this();
		});
	},

	//Удаляем less из собранной директории
	function removeLessFromBuild() {
		var styleFolder = new File(requireBuildConfig.dir + '/style'),
			_this = this;

		console.log('Removing Less from build');
		styleFolder.list(function (e, files) {
			if (e) {
				console.dir(e);
				process.exit(1);
			}
			lessFiles = Utils.filesRecursive(files, requireBuildConfig.dir + '/style/', null, function getOnlyLess(element) {
				return element.indexOf('.less') > -1;
			});
			lessFiles.forEach(function (item, index) {
				(new File(item)).remove(_this.parallel());
			});
		});
	},

	//Компилируем основные jade в статичные html
	function compileMainJades() {
		"use strict";
		var tplFolder = new File('./views'),
			toCompile = [],
			_this = this;

		tplFolder.list(1, function (e, files) {
			if (e) {
				console.dir(e);
				process.exit(1);
			}
			_.forEach(files, function (val, key) {
				if (!Utils.isType('object', val)) {
					toCompile.push(key);
				}
			});
			if (toCompile.length > 0) {
				jadeCompile(toCompile, 'views/', requireBuildConfig.dir + '', _this.parallel(), 'html');
			}
			_this.parallel()();
		});
	},

	function finish(e) {
		if (e) {
			console.dir(e);
			process.exit(1);
		}
		console.log('Build complete. Ok in ' + (Date.now() - start) / 1000 + 's');
	}
);


function jadeCompile(files, inFolder, outFolder, done, replaceJade) {
	var name, input, output,
		fd,
		i = 0;

	next();

	function next() {
		name = files[i++];
		if (!name) {
			return done();
		}
		input = inFolder + name;
		output = outFolder + name;
		if (replaceJade) {
			output = output.substr(0, output.lastIndexOf('.jade') + 1) + replaceJade;
		}
		fs.readFile(input, 'utf-8', render);
	}

	function render(e, data) {
		if (e) {
			sys.puts("jade readFile error: " + e.message);
			process.exit(1);
		}
		console.dir('Compiling Jade ' + input);
		var fn = jade.compile(data, _.assign(_.clone(jadeCompileOptions, false), {filename: input}));
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
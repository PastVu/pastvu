#!/usr/bin/env node

(function (port) {
	'use strict';

	var path = require('path'),
		fs = require('fs'),
		_existsSync = fs.existsSync || path.existsSync, // Since Node 0.8, .existsSync() moved from path to fs
		mkdirp = require('mkdirp'),
		formidable = require('formidable'),
		Utils = require('./commons/Utils.js'),
		options = {
			incomeDir: __dirname + '/../store/incoming',
			targetDir: __dirname + '/../store/private/photos/origin/',
			minFileSize: 10240, //10kB
			maxFileSize: 52428800, //50Mb
			maxPostSize: 53477376, //51Mb,
			acceptFileTypes: /\.(jpe?g|png)$/i,
			accessControl: {
				allowOrigin: '*',
				allowMethods: 'OPTIONS, POST',
				allowHeaders: 'Content-Type, Content-Range, Content-Disposition'
			}
		},

		setAccessControlHeaders = function (res) {
			res.setHeader('Access-Control-Allow-Origin', options.accessControl.allowOrigin);
			res.setHeader('Access-Control-Allow-Methods', options.accessControl.allowMethods);
			res.setHeader('Access-Control-Allow-Headers', options.accessControl.allowHeaders);
		},
		setNoCacheHeaders = function (res) {
			res.setHeader('Pragma', 'no-cache');
			res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
			res.setHeader('Content-Disposition', 'inline; filename="files.json"');
		},
		postHandlerResponse = function (req, res, result) {
			res.writeHead(200, {
				'Content-Type': req.headers.accept.indexOf('application/json') !== -1 ? 'application/json' : 'text/plain'
			});
			res.end(JSON.stringify(result));
		},
		postHandler = function (req, res, cb) {
			var form = new formidable.IncomingForm(),
				tmpFiles = [],
				files = [],
				map = {},
				counter = 1;

			form.uploadDir = options.incomeDir;
			form
				.on('fileBegin', function (name, file) {
					console.dir(file);
					tmpFiles.push(file.path);
					var fileInfo = new FileInfo(file, req, true);
					map[path.basename(file.path)] = fileInfo;
					files.push(fileInfo);
				})
				.on('file', function (name, file) {
					var fileInfo = map[path.basename(file.path)];

					fileInfo.size = file.size;
					if (!fileInfo.validate()) {
						fs.unlinkSync(file.path);
						return;
					}
					fs.renameSync(file.path, options.targetDir + fileInfo.fileDir + fileInfo.file);
				})
				.on('aborted', function () {
					tmpFiles.forEach(function (file) {
						fs.unlinkSync(file);
					});
				})
				.on('error', function (e) {
					console.dir(e);
				})
				.on('progress', function (bytesReceived/*, bytesExpected*/) {
					if (bytesReceived > options.maxPostSize) {
						console.log('~~~~');
						console.log('Too big, dropping');
						req.connection.destroy();
					}
				})
				.on('end', function () {
					counter -= 1;
					if (!counter) {
						cb(req, res, {files: files});
					}
				})
				.parse(req);
		},
		serve = function (req, res) {
			switch (req.method) {
			case 'OPTIONS':
				setAccessControlHeaders(res);
				res.end();
				break;
			case 'POST':
				setAccessControlHeaders(res);
				setNoCacheHeaders(res);
				postHandler(req, res, postHandlerResponse);
				break;
			default:
				console.log(405);
				res.statusCode = 405;
				res.end();
			}
		},

		fileNameGen = function (name) {
			return Utils.randomString(18, true) + name.substr(name.lastIndexOf('.'));
		},
		fileNameDir = function (fileName) {
			var result = fileName.substr(0, 3).split('').join('/') + '/';
			mkdirp.sync(options.targetDir + result);
			return result;
		},
		FileInfo = function (file) {
			this.name = file.name;
			this.size = file.size;
			this.type = file.type;
			this.createFileName();
		};

	FileInfo.prototype.createFileName = function () {
		this.file = fileNameGen(this.name);
		this.fileDir = fileNameDir(this.file);

		//Циклично проверяем на существование файла с таким имемнем, пока не найдем уникальное
		while (_existsSync(options.targetDir + this.fileDir + this.file)) {
			this.file = fileNameGen(this.file);
			this.fileDir = fileNameDir(this.file);
		}
	};
	FileInfo.prototype.validate = function () {
		if (options.minFileSize && options.minFileSize > this.size) {
			this.error = 'File is too small';
		} else if (options.maxFileSize && options.maxFileSize < this.size) {
			this.error = 'File is too big';
		} else if (!options.acceptFileTypes.test(this.name)) {
			this.error = 'Filetype not allowed';
		}
		return !this.error;
	};


	require('http').createServer(serve).listen(port);
}(8888));

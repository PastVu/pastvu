#!/usr/bin/env node
/*global require, __dirname, unescape, console */

(function (port) {
	'use strict';

	var path = require('path'),
		fs = require('fs'),
		_existsSync = fs.existsSync || path.existsSync, // Since Node 0.8, .existsSync() moved from path to fs
		formidable = require('formidable'),
		nodeStatic = require('node-static'),
		Utils = require('./commons/Utils.js'),
		options = {
			tmpDir: __dirname + '/../store/incoming',
			publicDir: __dirname + '/../store/public/photos',
			uploadDir: __dirname + '/../store/private/photos',
			uploadUrl: '/',
			maxPostSize: 11000000000, // 11 GB
			minFileSize: 1,
			maxFileSize: 10000000000, // 10 GB
			acceptFileTypes: /.+/i,
			// Files not matched by this regular expression force a download dialog,
			// to prevent executing any scripts in the context of the service domain:
			safeFileTypes: /\.(jpe?g|png)$/i,
			accessControl: {
				allowOrigin: '*',
				allowMethods: 'OPTIONS, POST',
				allowHeaders: 'Content-Type, Content-Range, Content-Disposition'
			},
			nodeStatic: {
				cache: 3600 // seconds to cache served files
			}
		},
		utf8encode = function (str) {
			return unescape(encodeURIComponent(str));
		},

		fileServer = new nodeStatic.Server(options.publicDir, options.nodeStatic),
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
			console.log('postHandler');
			var form = new formidable.IncomingForm(),
				tmpFiles = [],
				files = [],
				map = {},
				counter = 1,
				finish = function () {
					counter -= 1;
					if (!counter) {
						files.forEach(function (fileInfo) {
							fileInfo.initUrls(req);
						});
						cb(req, res, {files: files});
					}
				};
			form.uploadDir = options.tmpDir;
			form
				.on('fileBegin',function (name, file) {
					console.log('fileBegin');
					tmpFiles.push(file.path);
					var fileInfo = new FileInfo(file, req, true);
					fileInfo.safeName();
					map[path.basename(file.path)] = fileInfo;
					files.push(fileInfo);
				})
				.on('file',function (name, file) {
					console.log('file');
					var fileInfo = map[path.basename(file.path)];

					fileInfo.size = file.size;
					if (!fileInfo.validate()) {
						fs.unlink(file.path);
						return;
					}
					fs.renameSync(file.path, options.uploadDir + '/origin/' + fileInfo.file);
				}).on('aborted',function () {
					console.log('aborted');
					tmpFiles.forEach(function (file) {
						fs.unlink(file);
					});
				}).on('error',function (e) {
					console.log('error');
					console.log(e);
				}).on('progress',function (bytesReceived, bytesExpected) {
					console.log('progress');
					if (bytesReceived > options.maxPostSize) {
						req.connection.destroy();
					}
				}).on('end', finish).parse(req);
		},
		serve = function (req, res) {
			switch (req.method) {
			case 'OPTIONS':
				console.log('OPTIONS');
				setAccessControlHeaders(res);
				res.end();
				break;
			case 'POST':
				console.log('POST');
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

		genFileName = function (name) {
			return Utils.randomString(18, true) + name.substr(name.lastIndexOf('.'));
		},
		FileInfo = function (file) {
			this.name = file.name;
			this.file = genFileName(file.name);
			this.size = file.size;
			this.type = file.type;
		};


	fileServer.respond = function (pathname, status, _headers, files, stat, req, res, finish) {
		if (!options.safeFileTypes.test(files[0])) {
			// Force a download dialog for unsafe file extensions:
			res.setHeader(
				'Content-Disposition',
				'attachment; filename="' + utf8encode(path.basename(files[0])) + '"'
			);
		} else {
			// Prevent Internet Explorer from MIME-sniffing the content-type:
			res.setHeader('X-Content-Type-Options', 'nosniff');
		}
		nodeStatic.Server.prototype.respond
			.call(this, pathname, status, _headers, files, stat, req, res, finish);
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
	FileInfo.prototype.safeName = function () {
		// Prevent directory traversal and creating hidden system files:
		this.file = path.basename(this.file).replace(/^\.+/, '');
		// Prevent overwriting existing files:
		while (_existsSync(options.uploadDir + '/origin/' + this.file)) {
			this.file = genFileName(this.file);
		}
	};
	FileInfo.prototype.initUrls = function (req) {
		console.log(66);
		if (!this.error) {
			var baseUrl = (options.ssl ? 'https:' : 'http:') + '//' + req.headers.host + options.uploadUrl;
			this.url = baseUrl + 'origin/' + encodeURIComponent(this.file);
		}
	};


	require('http').createServer(serve).listen(port);
}(8888));

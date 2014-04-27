#!/usr/bin/env node
'use strict';

var path = require('path'),
	fs = require('fs'),
	os = require('os'),
	util = require('util'),
	gm = require('gm'),
	step = require('step'),
	_existsSync = fs.existsSync || path.existsSync, // Since Node 0.8, .existsSync() moved from path to fs
	log4js = require('log4js'),
	argv = require('optimist').argv,
	mkdirp = require('mkdirp'),
	formidable = require('formidable'),
	interfaces = os.networkInterfaces(),
	addresses = [];

require('./commons/JExtensions.js');

for (var k in interfaces) {
	if (interfaces.hasOwnProperty(k)) {
		for (var k2 in interfaces[k]) {
			if (interfaces[k].hasOwnProperty(k2)) {
				var address = interfaces[k][k2];
				if (address.family === 'IPv4' && !address.internal) {
					addresses.push(address.address);
				}
			}
		}
	}
}

var conf = JSON.parse(JSON.minify(fs.readFileSync(argv.conf || __dirname + '/config.json', 'utf8'))),
	storePath = path.normalize(argv.storePath || conf.storePath || (__dirname + "/../store/")), //Путь к папке хранилища
	land = argv.land || conf.land || 'dev', //Окружение (dev, test, prod)
	listenuport = argv.uport || conf.uport || 3001, //Порт прослушки сервера загрузки фотографий
	listenhost = argv.hostname || conf.hostname || undefined, //Слушать хост

	protocol = argv.protocol || conf.protocol || 'http', //Протокол сервера для клинетов
	domain = argv.domain || conf.domain || addresses[0] || '127.0.0.1', //Адрес сервера для клинетов
	port = argv.projectport || conf.projectport || '', //Порт сервера
	uport = argv.projectuport || conf.projectuport || '', //Порт сервера загрузки фотографий
	host = domain + uport, //Имя хоста (адрес+порт)

	logPath = path.normalize(argv.logPath || conf.logPath || (__dirname + "/logs")); //Путь к папке логов


console.log('\n');
mkdirp.sync(logPath);
log4js.configure('./log4js.json', {cwd: logPath});
var logger = log4js.getLogger("uploader.js");

global.appVar = {}; //Глоблальный объект для хранения глобальных переменных приложения
global.appVar.serverAddr = {protocol: protocol, domain: domain, host: host, port: port, uport: uport};

var Utils = require('./commons/Utils.js'),
	options = {
		incomeDir: path.normalize(storePath + 'incoming/'),
		targetDir: storePath + 'private/photos/',
		targetDirAva: storePath + 'private/avatars/',
		minPhotoSize: 10240, //10kB
		maxPhotoSize: 52428800, //50Mb
		maxPhotoPostSize: 53477376, //51Mb,
		minAvaSize: 1024, //1kB
		maxAvaSize: 7340032, //7Mb
		maxAvaPostSize: 8388608, //8Mb,
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
	postHandler = function (req, res, isAvatar, cb) {
		var form = new formidable.IncomingForm(),
			maxPostSize = isAvatar ? options.maxAvaPostSize : options.maxPhotoPostSize,
			targetDir = isAvatar ? options.targetDirAva : options.targetDir,
			validateFunc = isAvatar ? validateAvatar : validatePhoto,

			contentLength = req.headers && req.headers['content-length'] && Number(req.headers['content-length']),

			tmpFiles = [],
			files = [],
			map = {},
			counter = 1;

		//Современные браузеры сразу присылают размер запроса в байтах, можно сразу отклонить при превышении максимального размера
		if (contentLength && contentLength > maxPostSize) {
			tooBigPostDestroy(req, isAvatar, 0, contentLength);
		}

		form.uploadDir = options.incomeDir;
		form
			.on('fileBegin', function (name, file) {
				tmpFiles.push(file.path);
				var fileInfo = new FileInfo(file, targetDir, isAvatar ? 10 : 18, isAvatar ? 2 : 3);

				map[path.basename(file.path)] = fileInfo;
				files.push(fileInfo);
			})
			.on('file', function (name, file) {
				var fileInfo = map[path.basename(file.path)];

				fileInfo.size = file.size;
				fs.renameSync(file.path, options.incomeDir + fileInfo.file); //Переименовываем файл в сгенерированное нами имя
			})
			.on('aborted', function () {
				tmpFiles.forEach(function (file) {
					fs.unlinkSync(file);
				});
			})
			.on('error', function (e) {
				logger.warn(e && e.message || e);
			})
			.on('progress', function (bytesReceived, bytesExpected) {
				if (bytesReceived > maxPostSize) {
					tooBigPostDestroy(req, isAvatar, bytesReceived, bytesExpected);
				}
			})
			.on('end', function () {
				counter -= 1;
				if (!counter) {
					step(
						function () {
							for (var i = files.length; i--;) {
								validateFunc(files[i], this.parallel());
							}
						},
						function () {
							for (var i = files.length; i--;) {
								if (files[i].error) {
									fs.unlink(options.incomeDir + files[i].file, this.parallel());
								}
							}
							this.parallel()();
						},
						function () {
							cb(req, res, {files: files});
						}
					);
				}
			})
			.parse(req);
	},
	serve = function (req, res) {
		if (req.url !== '/upload' && req.url !== '/uploadava') {
			res.statusCode = 403;
			res.end();
			return;
		}
		setAccessControlHeaders(res);

		switch (req.method) {
		case 'OPTIONS':
			res.end();
			break;
		case 'POST':
			setNoCacheHeaders(res);
			postHandler(req, res, req.url === '/uploadava', postHandlerResponse);
			break;
		default:
			logger.warn(405);
			res.statusCode = 405;
			res.end();
		}
	},

	fileNameGen = function (name, len) {
		return Utils.randomString(len || 10, true) + name.substr(name.lastIndexOf('.')).toLowerCase();
	},
	fileNameDir = function (dir, fileName, depth) {
		var result = fileName.substr(0, depth || 1).replace(/(.)/gi, '$1/');
		mkdirp.sync(dir + result); //Создание папки
		return result;
	},
	FileInfo = function (file, targetDir, nameLen, dirDepth) {
		this.name = file.name;
		this.size = file.size;
		this.type = file.type;
		this.createFileName(targetDir, nameLen, dirDepth);
	};

FileInfo.prototype.createFileName = function (targetDir, nameLen, dirDepth) {
	this.file = fileNameGen(this.name, nameLen);
	this.fileDir = fileNameDir(targetDir, this.file, dirDepth);

	//Циклично проверяем на существование файла с таким имемнем, пока не найдем уникальное
	while (_existsSync(targetDir + this.fileDir + this.file)) {
		this.file = fileNameGen(this.name, nameLen);
		this.fileDir = fileNameDir(targetDir, this.file, dirDepth);
	}
};

function tooBigPostDestroy(req, isAvatar, bytesReceived, bytesExpected) {
	logger.warn('~~~~', 'Too big ' + (isAvatar ? 'avatar' : 'photo') + ', dropping', bytesReceived, bytesExpected);
	req.connection.destroy();
}

function validatePhoto(fileInfo, cb) {
	if (!options.acceptFileTypes.test(fileInfo.name)) {
		fileInfo.error = 'ftype';
		return cb();
	} else if (options.minPhotoSize && options.minPhotoSize > fileInfo.size) {
		fileInfo.error = 'fmin';
		return cb();
	} else if (options.maxPhotoSize && options.maxPhotoSize < fileInfo.size) {
		fileInfo.error = 'fmax';
		return cb();
	}

	gm(options.incomeDir + fileInfo.file).size(function (err, size) {
		if (err) {
			logger.error('~~~~', 'GM size error: ' + err);
			fileInfo.error = 'fpx';
			return cb();
		}
		var w = size && Number(size.width),
			h = size && Number(size.height);

		if (!w || !h || w < 400 || h < 400 || (w < 800 && h < 800)) {
			fileInfo.error = 'fpx';
			return cb();
		}
		cb();
	});
}

function validateAvatar(fileInfo, cb) {
	if (!options.acceptFileTypes.test(fileInfo.name)) {
		fileInfo.error = 'ftype';
		return cb();
	} else if (options.minAvaSize && options.minAvaSize > fileInfo.size) {
		fileInfo.error = 'fmin';
		return cb();
	} else if (options.maxAvaSize && options.maxAvaSize < fileInfo.size) {
		fileInfo.error = 'fmax';
		return cb();
	}

	gm(options.incomeDir + fileInfo.file).size(function (err, size) {
		if (err) {
			logger.error('~~~~', 'GM size error: ' + err);
			fileInfo.error = 'fpx';
			return cb();
		}
		var w = size && Number(size.width),
			h = size && Number(size.height),
			min = Math.min(w, h);

		if (!w || !h || w < 100 || h < 100) {
			fileInfo.error = 'fpx';
			return cb();
		}

		if (w > 100 || h > 100) {
			//Обрезаем из центра по минимальному размеру и ресайзим до 100px
			gm(options.incomeDir + fileInfo.file)
				.gravity('Center')
				.quality(90)
				.filter('Sinc')
				.noProfile() //Убираем EXIF
				.crop(min, min)
				.resize(100, 100)
				.write(options.incomeDir + fileInfo.file, function (err) {
					if (err) {
						logger.warn('~~~~', 'GM avatar resize error');
						fileInfo.error = 'fpx';
					}
					cb();
				});
		} else {
			cb();
		}
	});
}

/**
 * Handling uncaught exceptions
 */
process.on('uncaughtException', function (err) {
	// Add here storage for saving and resuming
	logger.fatal("PROCESS uncaughtException: " + (err && (err.message || err)));
	logger.trace(err && (err.stack || err));
});

require('http').createServer(serve).listen(listenuport, listenhost, function () {
	logger.info('Uploader host for users: [%s]', host);
	logger.info('Uploader server listening [%s:%s]\n', listenhost ? listenhost : '*', listenuport);
});
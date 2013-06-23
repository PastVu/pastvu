#!/usr/bin/env node
'use strict';

var path = require('path'),
	fs = require('fs'),
	os = require('os'),
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

	domain = argv.domain || conf.domain || addresses[0] || '127.0.0.1', //Адрес сервера для клинетов
	port = argv.projectport || conf.projectport || 3000, //Порт сервера
	uport = argv.projectuport || conf.projectuport || 3001, //Порт сервера загрузки фотографий
	host = domain + (uport === 80 ? '' : ':' + uport), //Имя хоста (адрес+порт)

	logPath = path.normalize(argv.logPath || conf.logPath || (__dirname + "/logs")); //Путь к папке логов


console.log('\n');
mkdirp.sync(logPath);
log4js.configure('./log4js.json', {cwd: logPath});
var logger = log4js.getLogger("uploader.js");

global.appVar = {}; //Глоблальный объект для хранения глобальных переменных приложения
global.appVar.serverAddr = {domain: domain, host: host, port: port, uport: uport};

var Utils = require('./commons/Utils.js'),
	options = {
		incomeDir: storePath + 'incoming',
		targetDir: storePath + 'private/photos/',
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
		setAccessControlHeaders(res);

		switch (req.method) {
		case 'OPTIONS':
			res.end();
			break;
		case 'POST':
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
		var result = fileName.substr(0, 3).replace(/(.)/gi, '$1/');
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


require('http').createServer(serve).listen(listenuport, listenhost, function() {
	logger.info('Uploader host for users: [%s]', host);
	logger.info('Uploader server listening [%s:%s]\n', listenhost ? listenhost : '*', listenuport);
});
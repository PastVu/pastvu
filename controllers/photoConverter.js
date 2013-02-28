'use strict';

var path = require('path'),
	async = require('async'),
	imageMagick = require('imagemagick'),
	Settings,
	User,
	Photo,
	PhotoConveyer,
	STPhotoConveyer,
	_ = require('lodash'),
	moment = require('moment'),
	ms =  require('ms'), // Tiny milisecond conversion utility
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	appEnv = {},

	conveyerLength = 0,
	conveyerMaxLength = 0,
	conveyerConverted = 0,

	logger = log4js.getLogger("PhotoConverter.js"),
	uploadDir = __dirname + '/../publicContent/photos',
	maxWorking = 1, // Возможно параллельно конвертировать
	goingToWork = 0, // Происходит выборка для дальнейшей конвертации
	working = 0, //Сейчас конвертируется
	imageSequence = [
		{
			version: 'standard',
			width: 1050,
			height: 700,
			strip: true,
			filter: 'Sinc',
			postfix: '>'
		},
		{
			version: 'thumb',
			width: 246,
			height: 164,
			filter: 'Sinc',
			gravity: function (w, h, w2, h2) {
				var result = {gravity: 'center', extent: w2 + "x" + h2},
					aspect = w / h,
					newH; //высота после пропорционального уменьшения ширины

				if (aspect <= 0.75) {
					//Портретная вытянутая более чем на 1.3(3)
					//Гравитация - север с отступом сверху 10% (но не более чем до края)
					newH = h * w2 / w;
					result.gravity = 'north';
					result.extent += '+0+' + (Math.min(newH * 0.1, (newH - h2) / 2) >> 0);
				} else if (aspect < 0.97) {
					//Портретная не сильно вытянутая
					//Гравитация - центр с отступом от центра наверх 10% (но не более чем до края)
					newH = h * w2 / w;
					result.extent += '+0-' + (Math.min(newH * 0.1, (newH - h2) / 2) >> 0);
				}
				return result;
			},
			postfix: '^'
		},
		{
			version: 'midi',
			width: 120,
			height: 80,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		},
		{
			version: 'mini',
			width: 90,
			height: 60,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		},
		{
			version: 'micro',
			width: 60,
			height: 60,
			crop: true,
			gravity: 'center'
		},
		{
			version: 'micros',
			width: 40,
			height: 40,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		}
	];

module.exports.loadController = function (app, db, io) {
	appEnv = app.get('appEnv');
	Photo = db.model('Photo');
	PhotoConveyer = db.model('PhotoConveyer');
	STPhotoConveyer = db.model('STPhotoConveyer');
	User = db.model('User');

	// Запускаем конвейер после рестарта сервера с флагом, что надо начинать с уже начатых
	setTimeout(function () {
		conveyerControl(true);
	}, 5000);

	PhotoConveyer.count({}, function (err, count) {
		conveyerLength = Math.max(count, conveyerMaxLength);
		conveyerMaxLength = conveyerLength;
	});

	// Планируем запись статистики конвейера на начало следующей 10-минутки
	var hourStart = +moment(Date.now()).startOf('hour');
	setTimeout(CollectConveyerStat, hourStart + ms('10m') * Math.ceil((Date.now() - hourStart) / ms('10m')) - Date.now() + 10);

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		(function () {
			function result(data) {
				socket.emit('getBoundsResult', data);
			}

			socket.on('checkConverter', function (data) {
				if (!hs.session.user) {
					result({message: 'Not authorized', error: true});
					return;
				}
			});
		}());

	});

};

// Собираем статистику конвейера на начало каждой 10-минутки
function CollectConveyerStat() {
	var st = new STPhotoConveyer({
		stamp: +moment(Date.now()).startOf('minute'),
		clength: conveyerMaxLength,
		converted: conveyerConverted
	});
	st.save(function (err) { if (err) { console.log('STPhotoConveyer error', err); } });

	conveyerMaxLength = conveyerLength;
	conveyerConverted = 0;
	setTimeout(CollectConveyerStat, ms('10m'));
}

/**
 * Добавление в конвейер конвертации фотографий
 * @param data Массив имен фотографий
 * @param cb Коллбэк успешности добавления
 */
module.exports.convertPhoto = function (data, cb) {
	var toConvert = [],
		toConvertObj = [];

	step(
		function () {
			PhotoConveyer.find({file: {$in: data}}).select('file').exec(this);
		},
		function (err, alreadyInConveyer) {
			if (err) {
				if (cb) {
					cb({message: err && err.message, error: true});
				}
				return;
			}

			toConvert = _.difference(data, _.pluck(alreadyInConveyer, 'file'));
			toConvert.forEach(function (item, index) {
				toConvertObj.push({file: item, added: Date.now(), converting: false});
			});
			PhotoConveyer.collection.insert(toConvertObj, this.parallel());
			Photo.update({file: {$in: toConvert}, del: {$ne: true}}, { $set: { convqueue: true }}, { multi: true }, this.parallel());
		},
		function (err) {
			if (err) {
				if (cb) {
					cb({message: err && err.message, error: true});
				}
				return;
			}

			conveyerLength += toConvertObj.length;
			conveyerMaxLength += Math.max(conveyerLength, conveyerMaxLength);

			if (cb) {
				cb({message: toConvertObj.length + ' photos added to convert conveyer'});
			}
			conveyerControl();
		}
	);
};

/**
 * Удаление фотографий из конвейера конвертаций
 * @param data Массив имен фотографий
 * @param cb Коллбэк успешности удаления
 */
module.exports.removePhotos = function (data, cb) {
	PhotoConveyer.findOneAndRemove({file: {$in: data}}, function (err, doc) {
		if (cb) {
			cb(err);
		}
		conveyerLength -= data.length;
	});
};

/**
 * Контроллер конвейера. Выбирает очередное фото из очереди и вызывает шаг конвейера
 * @param andConverting  Флаг, указывающий, что выбрать надо даже файлы,
 *                       у которых уже проставлен флаг конвертирования
 *                       (например, если сервер был остановлен во время конвертирования
 *                       и после запуска их надо опять сконвертировать)
 */
function conveyerControl(andConverting) {
	var toWork = maxWorking - goingToWork - working,
		query;
	if (toWork < 1) {
		return;
	}
	query = [false];
	if (andConverting) {
		query.push(true);
	}
	goingToWork += toWork;
	PhotoConveyer.find({converting: {$in: query}}).sort('added').limit(toWork).exec(function (err, files) {
		goingToWork -= toWork - files.length;
		if (err || files.length === 0) {
			return;
		}
		files.forEach(function (item, index) {
			goingToWork -= 1;
			working += 1;
			step(
				function setFlag() {
					item.converting = true; //Ставим флаг, что конвертация файла началась
					item.save(this.parallel());
					Photo.findOneAndUpdate({file: item.file, del: {$ne: true}}, { $set: { conv: true }}, { new: true, upsert: false }, this.parallel());
				},
				function toConveyer(err, photoConv, photo) {
					if (err || !photoConv || !photo) {
						if (photo) {
							//Присваиваем undefined, чтобы удалить свойства
							photo.conv = undefined;
							photo.convqueue = undefined;
							photo.save(this.parallel());
						}
						if (photoConv) {
							photoConv.remove(this.parallel());
						}
						this.parallel()();
					} else {
						conveyerStep(photoConv.file, function (err) {
							if (photo) {
								//Присваиваем undefined, чтобы удалить свойства
								photo.conv = undefined;
								photo.convqueue = undefined;
								photo.save(this.parallel());
							}
							if (err || !photoConv) {
								this.parallel()();
							} else if (photoConv) {
								photoConv.remove(this.parallel());
								conveyerConverted += 1;
							}
						}, this);
					}
				},
				function finish() {
					working -= 1;
					conveyerLength -= 1;
					conveyerControl();
				}
			);

		});
	});
}

/**
 * Очередной шаг конвейера
 * @param file Имя файла
 * @param cb Коллбэк завершения шага
 * @param ctx Контекст вызова коллбэка
 */
function conveyerStep(file, cb, ctx) {
	var sequence = [];

	sequence.push(function (callback) {
		imageMagick.identify(['-format', '{"w": "%w", "h": "%h", "f": "%C", "signature": "%#"}', path.normalize(uploadDir + '/origin/' + file)], function (err, data) {
			var info = {};
			if (err) {
				console.error(err);
			} else {
				data = JSON.parse(data);

				if (data.f) {
					info.format = data.f;
				}
				if (data.w) {
					info.w = parseInt(data.w, 10);
				}
				if (data.h) {
					info.h = parseInt(data.h, 10);
				}
				if (data.signature) {
					info.sign = data.signature;
				}
			}
			callback(err, info);
		});
	});
	sequence.push(function (info, callback) {
		Photo.findOneAndUpdate({file: file, del: {$ne: true}}, { $set: info}, { new: false, upsert: false }, function (err) {
			callback(err, info);
		});
	});

	imageSequence.forEach(function (item, index, array) {
		var o = {
			srcPath: path.normalize(uploadDir + '/' + (index > 0 ? array[index - 1].version : 'origin') + '/' + file),
			dstPath: path.normalize(uploadDir + '/' + item.version + '/' + file)
		};
		if (item.strip) {
			o.strip = item.strip;
		}
		if (item.width && item.height) {
			o.width = item.width;
			o.height = item.height + (item.postfix || ''); // Only Shrink Larger Images
		}
		if (item.filter) {
			o.filter = item.filter;
		}

		sequence.push(function (info, callback) {
			var gravity,
				extent;
			if (item.crop) {
				o.quality = 1;

				if (item.gravity) {
					o.gravity = item.gravity;
				}
				imageMagick.crop(o, function (err) {
					callback(err, info);
				});
			} else {
				if (item.gravity) { // Превью генерируем путем вырезания аспекта из центра
					// Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
					gravity = Utils.isType('function', item.gravity) ? item.gravity(info.w, info.h, item.width, item.height) : {gravity: item.gravity};
					extent = Utils.isType('object', gravity) && gravity.extent ? gravity.extent : item.width + "x" + item.height;
					o.customArgs = [
						"-gravity", gravity.gravity,
						"-extent", extent
					];
				}
				imageMagick.resize(o, function (err) {
					callback(err, info);
				});
			}
		});

	});
	async.waterfall(sequence, function (err, result) {
		cb.call(ctx, err);
	});
}
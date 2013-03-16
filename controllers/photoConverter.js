'use strict';

var path = require('path'),
	async = require('async'),
	imageMagick = require('imagemagick'),
	dbNative,
	Settings,
	User,
	Photo,
	PhotoConveyer,
	PhotoConveyerError,
	STPhotoConveyer,
	_ = require('lodash'),
	moment = require('moment'),
	ms = require('ms'), // Tiny milisecond conversion utility
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	appEnv = {},

	conveyerEnabled = true,
	conveyerLength = 0,
	conveyerMaxLength = 0,
	conveyerConverted = 0,

	logger = log4js.getLogger("PhotoConverter.js"),
	uploadDir = __dirname + '/../publicContent/photos',
	maxWorking = 2, // Возможно параллельно конвертировать
	goingToWork = 0, // Происходит выборка для дальнейшей конвертации
	working = 0, //Сейчас конвертируется

	imageVersions = {
		/*origin: {
			 parent: 0,
			 width: 1050,
			 height: 700,
			 strip: true,
			 filter: 'Sinc',
			 postfix: '>'
		 },*/
		standard: {
			parent: 'origin',
			width: 1050,
			height: 700,
			strip: true,
			filter: 'Sinc',
			postfix: '>'
		},
		thumb: {
			parent: 'standard',
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
		midi: {
			parent: 'standard',
			width: 150,
			height: 100,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		},
		mini: {
			parent: 'midi',
			width: 90,
			height: 60,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		},
		micro: {
			parent: 'mini',
			width: 60,
			height: 60,
			crop: true,
			gravity: 'center'
		},
		micros: {
			parent: 'micro',
			width: 40,
			height: 40,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		}
	},
	imageVersionsPriority = fillImgPrior('origin', 0),
	imageVersionsKeys = Object.keys(imageVersionsPriority),
	imageSequenceDefault = fillImgSequence(imageVersionsKeys);

function fillImgPrior(parent, level) {
	var result = {},
		childResult;
	_.forEach(imageVersions, function (item, key) {
		if (item.parent === parent) {
			result[key] = level;
			childResult = fillImgPrior(key, level + 1);
			_.assign(result, childResult);
		}
	});
	return result;
}
function fillImgSequence(variants) {
	if (!Array.isArray(variants) || variants.length === 0) {
		return imageSequenceDefault;
	}
	variants.sort(function (a, b) {
		return imageVersionsPriority[a] - imageVersionsPriority[b];
	});
	return variants;
}

module.exports.loadController = function (app, db, io) {
	appEnv = app.get('appEnv');

	dbNative = db.db;

	Photo = db.model('Photo');
	PhotoConveyer = db.model('PhotoConveyer');
	PhotoConveyerError = db.model('PhotoConveyerError');
	STPhotoConveyer = db.model('STPhotoConveyer');
	User = db.model('User');

	// Запускаем конвейер после рестарта сервера, устанавливаем все недоконвертированные фото обратно в false
	setTimeout(function () {
		PhotoConveyer.update({converting: {$exists: true}}, { $unset: { converting: 1 }}, {multi: true}, function (err) {
			if (err) {
				logger.error(err);
				return;
			}
			conveyerControl();
		});
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
			socket.on('conveyerStartStop', function (value) {
				if (Utils.isType('boolean', value)) {
					conveyerEnabled = value;
				}
				socket.emit('conveyerStartStopResult', {
					conveyerEnabled: conveyerEnabled
				});
			});
		}());
		(function () {
			socket.on('conveyerClear', function (value) {
				if (value === true) {
					conveyerEnabled = value;
					conveyerClear(function (result) {
						socket.emit('conveyerClearResult', result);
					});
				}
			});
		}());

		(function () {
			function result(data) {
				socket.emit('getStatConveyer', data);
			}

			socket.on('statConveyer', function (data) {
				if (!hs.session.user) {
					result({message: 'Not authorized for statConveyer', error: true});
					return;
				}
				STPhotoConveyer.collection.find({}, {_id: 0, __v: 0}, {sort: 'stamp'}, function (err, docs) {
					docs.toArray(function (err, docs) {
						var i = docs.length;
						while (i--) {
							docs[i].stamp = docs[i].stamp.getTime();
						}
						result({data: docs});
					});

				});
			});
		}());

		(function statFast() {
			socket.on('giveStatFastConveyer', function (data) {
				socket.emit('takeStatFastConveyer', {
					clength: conveyerLength,
					cmaxlength: conveyerMaxLength,
					converted: conveyerConverted
				});
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
	st.save(function (err) {
		if (err) {
			logger.error('STPhotoConveyer error. ' + err);
		}
	});

	conveyerMaxLength = conveyerLength;
	conveyerConverted = 0;
	setTimeout(CollectConveyerStat, ms('10m'));
}

/**
 * Добавление в конвейер конвертации фотографий
 * @param data Массив объектов {file: '', variants: []}
 * @param cb Коллбэк успешности добавления
 */
module.exports.addPhotos = function (data, cb) {
	var toConvert = [],
		toConvertObj,
		toConvertObjs = [],
		stamp = new Date(),
		i;

	step(
		function () {
			for (i = 0; i < data.length; i++) {
				if (data[i].file) {
					toConvertObj = {file: data[i].file, added: stamp};
					if (Array.isArray(data[i].variants) && data[i].variants.length > 0) {
						toConvertObj.variants = data[i].variants;
					}
					toConvertObjs.push(toConvertObj);
				}
			}
			toConvert = _.pluck(toConvertObjs, 'file');
			PhotoConveyer.collection.insert(toConvertObjs, this.parallel());
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
				cb({message: toConvert.length + ' photos added to convert conveyer'});
			}
			conveyerControl();
		}
	);
};

/**
 * Добавление в конвейер конвертации всех фотографий
 * @param data Объект с вариантами {variants: []}
 * @param cb Коллбэк успешности добавления
 */
module.exports.addPhotosAll = function (data, cb) {
	var variantsArrString = '';

	if (Array.isArray(data.variants) && data.variants.length > 0 && data.variants.length < imageVersionsKeys.length) {
		variantsArrString = JSON.stringify(data.variants);
	}

	dbNative.eval('convertPhotosAll(' + variantsArrString + ')', function (err, ret) {
		if (err) {
			cb({message: err && err.message, error: true});
			return;
		}
		if (ret && ret.error) {
			cb({message: ret.message || '', error: true});
			return;
		}
		cb(ret);
	});
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
 * Очищает конвейер, кроме тех фотографий, которые сейчас конвертируются
 */
function conveyerClear(cb) {
	PhotoConveyer.remove({converting: {$exists: false}}, function (err) {
		if (err) {
			cb({message: err || 'Error occurred', error: true});
		}
		PhotoConveyer.count({}, function (err, count) {
			conveyerLength = count;
			if (cb) {
				cb({message: 'Cleared ok!'});
			}
		});
	});
}

/**
 * Контроллер конвейера. Выбирает очередное фото из очереди и вызывает шаг конвейера
 */
function conveyerControl() {
	var toWork = maxWorking - goingToWork - working;
	if (!conveyerEnabled || toWork < 1) {
		return;
	}
	goingToWork += toWork;

	PhotoConveyer.find({converting: {$exists: false}}).sort('added').limit(toWork).exec(function (err, files) {
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
						(new PhotoConveyerError({
							file: photoConv.file,
							added: photoConv.added,
							error: (err ? String(err) : (!photo ? 'No such photo' : 'Conveyer setting converting=true save error'))
						})).save(this.parallel());
						if (photo) {
							photo.conv = undefined;
							photo.convqueue = undefined;
							photo.save(this.parallel());
						}
						if (photoConv) {
							photoConv.remove(this.parallel());
						}
						conveyerConverted -= 1;
					} else {
						conveyerStep(photoConv.file, photoConv.variants, function (err) {
							if (err) {
								(new PhotoConveyerError({
									file: photoConv.file,
									added: photoConv.added,
									error: String(err)
								})).save(this.parallel());
							}
							//Присваиваем undefined, чтобы удалить свойства
							photo.conv = undefined;
							photo.convqueue = undefined;
							photo.save(this.parallel());
							photoConv.remove(this.parallel());
						}, this);
					}
				},
				function finish() {
					working -= 1;
					conveyerLength -= 1;
					conveyerConverted += 1;
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
function conveyerStep(file, variants, cb, ctx) {
	var asyncSequence = [],
		imgSequence = fillImgSequence(variants);

	asyncSequence.push(function (callback) {
		callback(null, file);
	});
	asyncSequence.push(identifyFile);
	asyncSequence.push(saveIdentifiedInfo);

	imgSequence.forEach(function (variantName) {
		var variant = imageVersions[variantName],
			o = {
				srcPath: path.normalize(uploadDir + '/' + variant.parent + '/' + file),
				dstPath: path.normalize(uploadDir + '/' + variantName + '/' + file)
			};

		if (variant.strip) {
			o.strip = variant.strip;
		}
		if (variant.width && variant.height) {
			o.width = variant.width;
			o.height = variant.height + (variant.postfix || ''); // Only Shrink Larger Images
		}
		if (variant.filter) {
			o.filter = variant.filter;
		}

		//console.dir(o);
		asyncSequence.push(function (info, callback) {
			var gravity,
				extent;
			if (variant.crop) {
				o.quality = 1;

				if (variant.gravity) {
					o.gravity = variant.gravity;
				}
				imageMagick.crop(o, function (err) {
					callback(err, info);
				});
			} else {
				if (variant.gravity) { // Превью генерируем путем вырезания аспекта из центра
					// Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
					gravity = Utils.isType('function', variant.gravity) ? variant.gravity(info.w, info.h, variant.width, variant.height) : {gravity: variant.gravity};
					extent = Utils.isType('object', gravity) && gravity.extent ? gravity.extent : variant.width + "x" + variant.height;
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

	async.waterfall(asyncSequence, function (err, result) {
		cb.call(ctx, err);
	});
}

function identifyFile(file, callback) {
	imageMagick.identify(['-format', '{"w": "%w", "h": "%h", "f": "%C", "signature": "%#"}', path.normalize(uploadDir + '/origin/' + file)], function (err, data) {
		var info = {};
		if (err) {
			logger.error(err);
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
		callback(err, file, info);
	});
}
function saveIdentifiedInfo(file, info, callback) {
	Photo.findOneAndUpdate({file: file, del: {$ne: true}}, { $set: info}, { new: false, upsert: false }, function (err) {
		callback(err, info);
	});
}
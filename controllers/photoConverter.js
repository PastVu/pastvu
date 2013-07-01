'use strict';

var path = require('path'),
	async = require('async'),
	imageMagick = require('imagemagick'),
	mkdirp = require('mkdirp'),
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
	logger = log4js.getLogger("photoConverter.js"),
	appEnv = {},

	photoController = require('./photo.js'),

	conveyerEnabled = true,
	conveyerLength = 0,
	conveyerMaxLength = 0,
	conveyerConverted = 0,

	sourceDir = global.appVar.storePath + 'private/photos/',
	targetDir = global.appVar.storePath + 'public/photos/',
	waterDir = __dirname + '/../misc/watermark/',

	maxWorking = 2, // Возможно параллельно конвертировать
	goingToWork = 0, // Происходит выборка для дальнейшей конвертации
	working = 0, //Сейчас конвертируется

	imageVersions = {
		a: {
			parent: sourceDir,
			desc: 'Origin with watermark',
			dir: 'a/',
			noTransforn: true,
			water: true
		},
		d: {
			parent: sourceDir,
			desc: 'Standard for photo page',
			dir: 'd/',
			width: 1050,
			height: 700,
			strip: true,
			postfix: '>',
			water: true
		},
		h: {
			parent: sourceDir,
			desc: 'Thumb',
			dir: 'h/',
			width: 246,
			height: 164,
			strip: true,
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
		m: {
			parent: 'd',
			desc: 'Midi',
			dir: 'm/',
			width: 150,
			height: 100,
			filter: 'Sinc',
			gravity: 'center',
			postfix: '^'
		},
		q: {
			parent: 'm',
			desc: 'Mini',
			dir: 'q/',
			width: 90,
			height: 60,
			gravity: 'center',
			postfix: '^'
		},
		s: {
			parent: 'm',
			desc: 'Micro',
			dir: 's/',
			width: 60,
			height: 60,
			gravity: 'center',
			postfix: '^'
			//crop: true //Crop занимает больше места чем ресайз http://www.imagemagick.org/discourse-server/viewtopic.php?f=1&t=20415
		},
		x: {
			parent: 's',
			desc: 'Micros',
			dir: 'x/',
			width: 40,
			height: 40,
			gravity: 'center',
			postfix: '^'
		}
	},
	imageVersionsPriority = fillImgPrior(sourceDir, 0),
	imageVersionsKeys = Object.keys(imageVersionsPriority),
	imageSequenceDefault = fillImgSequence(imageVersionsKeys),

	waterMarkGen = (function () {
		var waterFontPath = path.normalize(waterDir + 'AdobeFanHeitiStd-Bold.otf'),
			sizes = {
				size: {
					small: '280x14',
					mid: '700x28',
					big: '900x40'
				},
				pointsize: {
					small: '12',
					mid: '24',
					big: '32'
				},
				geometry: {
					small: '+20+2',
					mid: '+36+7',
					big: '+46+8'
				},
				logo: {
					small: path.normalize(waterDir + 'logoSmall.png'),
					mid: path.normalize(waterDir + 'logoMid.png'),
					big: path.normalize(waterDir + 'logo.png')
				}
			};

		return function (options) {
			return [
				'-size',
				sizes.size[options.size],
				'xc:none',
				'-font',
				waterFontPath,
				'-pointsize',
				sizes.pointsize[options.size],
				'-gravity',
				'west',
				'-stroke',
				'rgba(0,0,0,0.35)',
				'-strokewidth',
				'3',
				'-fill',
				'#888',
				'-annotate',
				'0',
				options.txt,
				'+repage',
				'-stroke',
				'none',
				'-fill',
				'#e8e8e8',
				'-annotate',
				'+0+0',
				options.txt,
				options.source,
				'+swap',
				'-gravity',
				'southwest',
				'-geometry',
				sizes.geometry[options.size],
				'-composite',
				'-gravity',
				'southwest',
				'-geometry',
				'+3+3',
				sizes.logo[options.size],
				'-composite',
				options.target
			];
		};
	}());


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
					if (value) {
						conveyerControl();
					}
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

			socket.on('statConveyer', function () {
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
			socket.on('giveStatFastConveyer', function () {
				socket.emit('takeStatFastConveyer', {
					conveyerEnabled: conveyerEnabled,
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
		stamp: new Date(+moment(Date.now()).startOf('minute')),
		clength: conveyerMaxLength,
		converted: conveyerConverted
	});
	st.save(function (err) {
		if (err) {
			logger.error('STPhotoConveyer error.\n ' + err);
		}
	});

	conveyerMaxLength = conveyerLength;
	conveyerConverted = 0;
	setTimeout(CollectConveyerStat, ms('10m'));
}

/**
 * Добавление в конвейер конвертации фотографий
 * @param data Массив объектов {cid: 123, variants: []}
 * @param cb Коллбэк успешности добавления
 */
module.exports.addPhotos = function (data, cb) {
	var cid,
		toConvertObj,
		toConvertObjs = [],
		stamp = new Date();

	step(
		function () {
			for (var i = 0; i < data.length; i++) {
				cid = Number(data[i].cid);
				if (cid) {
					toConvertObj = {cid: cid, added: stamp};
					if (Array.isArray(data[i].variants) && data[i].variants.length > 0) {
						toConvertObj.variants = data[i].variants;
					}
					toConvertObjs.push(toConvertObj);
				}
			}
			if (toConvertObjs.length) {
				PhotoConveyer.collection.insert(toConvertObjs, this);
			} else {
				this();
			}
		},
		function (err) {
			if (err) {
				if (cb) {
					cb(err);
				}
				return;
			}

			conveyerLength += toConvertObjs.length;
			conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);

			if (cb) {
				cb(null, {message: toConvertObjs.length + ' photos added to convert conveyer'});
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
			return cb({message: err && err.message, error: true});
		}
		if (ret && ret.error) {
			return cb({message: ret.message || '', error: true});
		}

		conveyerLength += ret.photosAdded;
		conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);
		conveyerControl();

		cb(ret);
	});
};

/**
 * Удаление фотографий из конвейера конвертаций
 * @param data Массив cid
 * @param cb Коллбэк успешности удаления
 */
module.exports.removePhotos = function (data, cb) {
	PhotoConveyer.remove({cid: {$in: data}}, function (err, docs) {
		if (cb) {
			cb(err);
		}
		conveyerLength -= docs.length;
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

		files.forEach(function (photoConv) {
			goingToWork -= 1;
			working += 1;
			async.waterfall(
				[
					function find(callback) {
						photoController.findPhoto({cid: photoConv.cid}, {cid: 1, file: 1, user: 1, w: 1, h: 1, ws: 1, hs: 1, conv: 1, convqueue: 1}, {role: 10}, true, callback);
					},
					function getUser(photo, callback) {
						if (!photo) {
							return callback({message: 'Can not find such photo'}, photo);
						}
						photo.populate({path: 'user', select: {_id: 0, login: 1}}, callback);
					},
					function setFlag(photo, callback) {
						step (
							function () {
								photo.conv = true;
								photo.save(this.parallel());
								photoConv.converting = true;
								photoConv.save(this.parallel());
							},
							function (err, photo, photoConv) {
								conveyerStep(photo, photoConv.variants, function (err) {
									callback(err, photo, photoConv);
								}, this);
							}
						);
					}
				],
				function (err, photo, photoConv) {
					step (
						function () {
							if (err) {
								(new PhotoConveyerError({
									cid: photoConv.cid,
									added: photoConv.added,
									error: String(err && err.message)
								})).save(this.parallel());
							} else {
								conveyerConverted += 1;
							}
							if (photo) {
								photo.conv = undefined; //Присваиваем undefined, чтобы удалить свойства
								photo.convqueue = undefined;
								photo.save(this.parallel());
							}
							photoConv.remove(this.parallel());
						},
						function (err) {
							working -= 1;
							conveyerLength -= 1;
							conveyerControl();
						}
					);
				}
			);
		});
	});
}

/**
 * Очередной шаг конвейера
 * @param photo Объект фотографии
 * @param variants Варианты для конвертации
 * @param cb Коллбэк завершения шага
 * @param ctx Контекст вызова коллбэка
 */
function conveyerStep(photo, variants, cb, ctx) {
	var asyncSequence = [],
		imgSequence = fillImgSequence(variants),

		data = {
			photo: photo,
			variants: variants,
			waterTxt: ' www.pastvu.com  |  ' + photo.user.login + '  |  #' + photo.cid
		};

	asyncSequence.push(function (callback) {
		callback(null, data);
	});

	//Если инфо не существует, запускаем identify
	if (!photo.w || !photo.h) {
		asyncSequence.push(identifySourceFile);
	}

	imgSequence.forEach(function (variantName) {
		var variant = imageVersions[variantName],
			src = variant.parent === sourceDir ? sourceDir : targetDir + imageVersions[variant.parent].dir,
			dstDir = path.normalize(targetDir + variant.dir + photo.file.substr(0, 5)),
			o = {
				srcPath: path.normalize(src + photo.file),
				dstPath: path.normalize(targetDir + variant.dir + photo.file)
			};

		if (variant.strip) {
			o.strip = variant.strip;
		}
		if (variant.filter) {
			o.filter = variant.filter;
		}

		asyncSequence.push(function (data, callback) {
			mkdirp(dstDir, null, function (err) {
				callback(err, data);
			});
		});
		if (!variant.noTransforn) {
			if (variant.width && variant.height) {
				o.width = variant.width;
				o.height = variant.height + (variant.postfix || ''); // Only Shrink Larger Images
			}
			asyncSequence.push(function (data, callback) {
				var gravity,
					extent;
				if (variant.crop) {
					o.quality = 1;

					if (variant.gravity) {
						o.gravity = variant.gravity;
					}
					imageMagick.crop(o, function (err) {
						callback(err, data);
					});
				} else {
					if (variant.gravity) {
						// Превью генерируем путем вырезания аспекта из центра
						// Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
						gravity = Utils.isType('function', variant.gravity) ? variant.gravity(data.photo.w, data.photo.h, variant.width, variant.height) : {gravity: variant.gravity};
						extent = Utils.isType('object', gravity) && gravity.extent ? gravity.extent : variant.width + "x" + variant.height;
						o.customArgs = [
							"-gravity", gravity.gravity,
							"-extent", extent
						];
					}
					imageMagick.resize(o, function (err) {
						callback(err, data);
					});
				}
			});

			if (variantName === 'd') {
				asyncSequence.push(function (data, callback) {
					imageMagick.identify(['-format', '{"w": "%w", "h": "%h"}', o.dstPath], function (err, result) {
						if (err) {
							logger.error(err);
						} else {
							result = JSON.parse(result);

							data.photo.ws = parseInt(result.w, 10) || undefined;
							data.photo.hs = parseInt(result.h, 10) || undefined;
						}
						callback(err, data);
					});
				});
			}
		}

		if (variant.water) {
			asyncSequence.push(function (data, callback) {
				var original = variantName === 'a',
					w = original ? data.photo.w : data.photo.ws,
					h = original ? data.photo.h : data.photo.hs,
					size = 'small',
					source = original ? o.srcPath : o.dstPath,
					target = o.dstPath;

				if (w > 2400 || h > 1600) {
					size = 'big';
				} else if (w > 1350 || h > 900) {
					size = 'mid';
				}

				imageMagick.convert(
					waterMarkGen({txt: data.waterTxt, size: size, source: source, target: target}),
					function (err) {
						callback(err, data);
					}
				);

			});
		}
	});

	async.waterfall(asyncSequence, function (err) {
		cb.call(ctx, err);
	});
}

function identifySourceFile(data, callback) {
	imageMagick.identify(['-format', '{"w": "%w", "h": "%h", "f": "%C", "signature": "%#"}', path.normalize(sourceDir + data.photo.file)], function (err, result) {
		if (err) {
			logger.error(err);
		} else {
			result = JSON.parse(result);

			data.photo.w = parseInt(result.w, 10) || undefined;
			data.photo.h = parseInt(result.h, 10) || undefined;
			data.photo.format = result.f || undefined;
			data.photo.sign = result.signature || undefined;
		}
		callback(err, data);
	});
}

/**
 a - origin
 b
 c
 d - standard 1050x700
 e
 f
 g
 h - thumb 246x164
 i
 j
 k
 l
 m - midi 150x100
 n
 o
 p
 q - mini 90x60
 r
 s - micro 60x60
 t
 u
 v
 w
 x - micros 40x40
 y
 z
 */
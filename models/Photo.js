'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var PhotoSheme = new mongoose.Schema(
		{
			cid: {type: Number, index: { unique: true }},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			album: {type: Number},
			stack: {type: String},
			stack_order: {type: Number},

			file: {type: String, index: { unique: true }},
			loaded: {type: Date, 'default': Date.now, required: true, index: true},
			type: {type: String}, // like 'image/jpeg'
			format: {type: String}, // like 'JPEG'
			sign: {type: String},
			size: {type: Number},
			w: {type: Number}, //Оригинальная ширина
			h: {type: Number}, //Оригинальная высота
			ws: {type: Number}, //Стандартная ширина
			hs: {type: Number}, //Стандартная высота

			geo: {type: [Number], index: '2d'}, //Индексированный массив [lng, lat]
			dir: {type: String},

			title: {type: String},
			year: {type: Number},
			year2: {type: Number},
			address: {type: String},
			desc: {type: String},
			source: {type: String},
			author: {type: String},

			stats_day: {type: Number},
			stats_week: {type: Number},
			stats_all: {type: Number},
			ccount: {type: Number}, //Кол-во комментариев
			frags: [], //Фрагменты с комментариями

			conv: {type: Boolean}, //Конвертируется
			convqueue: {type: Boolean}, //В очереди на конвертацию
			fresh: {type: Boolean}, //Новое
			disabled: {type: Boolean}, //Не активное
			del: {type: Boolean} //К удалению
		},
		{
			strict: true
		}
	),
	PhotoConveyerSheme = new mongoose.Schema(
		{
			file: {type: String, index: true},
			added: {type: Date, 'default': Date.now, required: true, index: true},
			variants: [String], // Версии, которые необходимо конвертировать
			converting: {type: Boolean}
		},
		{
			strict: true
		}
	),
// Ошибки конвертирования
	PhotoConveyerErrorSheme = new mongoose.Schema(
		{
			file: {type: String, index: true},
			added: {type: Date},
			stamp: {type: Date, 'default': Date.now},
			error: {type: String}
		},
		{
			strict: true
		}
	),
//Статистика заполненности конвейера
	STPhotoConveyerSheme = new mongoose.Schema(
		{
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			clength: {type: Number}, // Максимальная длина конвейра на дату
			converted: {type: Number} // Обработанно фотографий на дату
		},
		{
			strict: true
		}
	);


/**
 * Перед каждым сохранением делаем проверки
 * @instance
 * @param {string}
 * @param {function} cb
 */
PhotoSheme.pre('save', function (next) {

	// check year2
	if (this.isModified('year') || this.isModified('year2')) {
		if (!this.year2 || this.year2 < this.year) {
			this.year2 = this.year;
		}
	}

	return next();
});

PhotoSheme.statics.resetStatDay = function (cb) {
	this.update({}, { $set: { stats_day: 0} }, {multi: true}, cb);
};

PhotoSheme.statics.resetStatWeek = function (cb) {
	this.update({}, { $set: { stats_week: 0} }, {multi: true}, cb);
};

PhotoSheme.statics.getPhoto = function (query, cb) {
	if (!query || !query.cid) {
		cb(null, 'cid is not specified');
	}
	this.findOneAndUpdate(query, { $inc: { stats_day: 1, stats_week: 1, stats_all: 1} }, {new: true}).populate('user', 'login avatar avatarW avatarH firstName lastName').select('-_id -__v').exec(cb);
};

PhotoSheme.statics.getPhotoCompact = function (query, options, cb) {
	if (!query || !query.cid) {
		cb(null, 'cid is not specified');
	}
	options = options || {};
	this.findOne(query, null, options).select('-_id cid file loaded title year ccount fresh disabled conv convqueue del').exec(cb);
};

PhotoSheme.statics.getPhotosCompact = function (query, options, cb) {
	if (!query) {
		cb(null, 'query is not specified');
	}
	options = options || {};
	this.find(query, null, options).sort('-loaded').select('-_id cid file loaded title year ccount fresh disabled conv convqueue del').exec(cb);
};


module.exports.makeModel = function (db) {
	db.model('Photo', PhotoSheme);
	db.model('PhotoConveyer', PhotoConveyerSheme);
	db.model('PhotoConveyerError', PhotoConveyerErrorSheme);
	db.model('STPhotoConveyer', STPhotoConveyerSheme);
};

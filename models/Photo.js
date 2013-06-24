'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var FragmentSchema = new Schema({
		cid: {type: Number}, //Comment cid
		l: {type: Number}, //Left
		t: {type: Number}, //Top
		w: {type: Number}, //Width
		h: {type: Number}  //Height
	}),
	commonStructure = {
		cid: {type: Number, index: { unique: true }},
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},

		file: {type: String, required: true}, //Имя файла c путем, например 'i/n/o/ino6k6k6yz.jpg'

		ldate: {type: Date, 'default': Date.now, required: true, index: true}, // Время загрузки
		type: {type: String}, // like 'image/jpeg'
		format: {type: String}, // like 'JPEG'
		sign: {type: String},
		size: {type: Number},
		w: {type: Number}, //Оригинальная ширина
		h: {type: Number}, //Оригинальная высота
		ws: {type: Number}, //Стандартная ширина
		hs: {type: Number}, //Стандартная высота

		geo: {type: [Number], index: '2d'}, //Индексированный массив [lng, lat]
		dir: {type: String, 'default': ''},

		title: {type: String, 'default': ''},
		year: {type: Number, 'default': 2000},
		year2: {type: Number},
		address: {type: String},
		desc: {type: String},
		source: {type: String},
		author: {type: String},

		conv: {type: Boolean}, //Конвертируется
		convqueue: {type: Boolean} //В очереди на конвертацию
	},
	additionalStructure = {
		adate: {type: Date, index: true}, // Время активации

		vdcount: {type: Number, index: true}, //Кол-во просмотров за день
		vwcount: {type: Number, index: true}, //Кол-во просмотров за неделю
		vcount: {type: Number, index: true}, //Кол-во просмотров всего
		ccount: {type: Number, index: true}, //Кол-во комментариев
		frags: [FragmentSchema] //Фрагменты с комментариями
	},

	PhotoSchema_Fresh = new Schema(commonStructure, {collection: 'photos_fresh', strict: true}),
	PhotoSchema_Disabled = new Schema(commonStructure, {collection: 'photos_disabled', strict: true}),
	PhotoSchema_Del = new Schema(commonStructure, {collection: 'photos_del', strict: true}),
	PhotoSchema = new Schema(commonStructure, {strict: true}),

	PhotoConveyerSchema = new Schema(
		{
			cid: {type: Number, index: true},
			added: {type: Date, 'default': Date.now, required: true, index: true},
			variants: [String], // Версии, которые необходимо конвертировать
			converting: {type: Boolean}
		},
		{
			strict: true
		}
	),
// Ошибки конвертирования
	PhotoConveyerErrorSchema = new Schema(
		{
			cid: {type: String, index: true},
			added: {type: Date},
			stamp: {type: Date, 'default': Date.now},
			error: {type: String}
		},
		{
			strict: true
		}
	),
//Статистика заполненности конвейера
	STPhotoConveyerSchema = new Schema(
		{
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			clength: {type: Number}, // Максимальная длина конвейра на дату
			converted: {type: Number} // Обработанно фотографий на дату
		},
		{
			strict: true
		}
	);


PhotoSchema_Disabled.add(additionalStructure);
PhotoSchema_Del.add(additionalStructure);
PhotoSchema.add(additionalStructure);

//В основной коллекции фотографий индексируем выборку координат по годам для выборки на карте
//Compound index http://docs.mongodb.org/manual/core/geospatial-indexes/#compound-geospatial-indexes
PhotoSchema.index({ g: '2d', year: 1});


/**
 * Перед каждым сохранением делаем проверки
 * @instance
 * @param {string}
 * @param {function} cb
 */
PhotoSchema.pre('save', function (next) {

	// check year2
	if (this.isModified('year') || this.isModified('year2')) {
		if (this.year < 1826) {
			this.year = 1826;
		} else if (this.year > 2000) {
			this.year = 2000;
		}
		if (!Number(this.year2) || this.year2 < this.year || this.year2 > 2000) {
			this.year2 = this.year;
		}
	}

	return next();
});

PhotoSchema.statics.resetStatDay = function (cb) {
	this.update({}, { $set: { vdcount: 0} }, {multi: true}, cb);
};

PhotoSchema.statics.resetStatWeek = function (cb) {
	this.update({}, { $set: { vwcount: 0} }, {multi: true}, cb);
};

PhotoSchema.statics.getPhoto = function (query, cb) {
	if (!query || !query.cid) {
		cb({message: 'cid is not specified'});
	}
	this.findOneAndUpdate(query, { $inc: { vdcount: 1, vwcount: 1, vcount: 1} }, {new: true}).populate('user', 'login avatar firstName lastName').select('-_id -__v -frags._id').exec(cb);
};

PhotoSchema.statics.getPhotoCompact = function (query, options, cb) {
	if (!query || !query.cid) {
		cb({message: 'cid is not specified'});
	}
	options = options || {};
	this.findOne(query, null, options).select('-_id cid file ldate adate title year ccount fresh disabled conv convqueue del').exec(cb);
};

PhotoSchema.statics.getPhotosCompact = function (query, options, cb) {
	if (!query) {
		cb({message: 'query is not specified'});
	}
	options = options || {};
	this.find(query, null, options).sort('-adate').select('-_id cid file ldate adate title year ccount fresh disabled conv convqueue del').exec(cb);
};
PhotoSchema.statics.getPhotosFreshCompact = function (query, options, cb) {
	if (!query) {
		cb({message: 'query is not specified'});
	}
	options = options || {};
	this.find(query, null, options).sort('-ldate').select('-_id cid file ldate adate title year ccount fresh disabled conv convqueue del').exec(cb);
};


module.exports.makeModel = function (db) {
	db.model('Photo', PhotoSchema);
	db.model('PhotoFresh', PhotoSchema_Fresh);
	db.model('PhotoDisabled', PhotoSchema_Disabled);
	db.model('PhotoDel', PhotoSchema_Del);

	db.model('PhotoConveyer', PhotoConveyerSchema);
	db.model('PhotoConveyerError', PhotoConveyerErrorSchema);
	db.model('STPhotoConveyer', STPhotoConveyerSchema);
};

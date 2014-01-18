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
	PhotoNewSchema = new Schema({
		cid: {type: Number, index: {unique: true}},
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},

		file: {type: String, required: true}, //Имя файла c путем, например 'i/n/o/ino6k6k6yz.jpg'

		ldate: {type: Date, 'default': Date.now, required: true, index: true}, // Время загрузки
		adate: {type: Date, sparse: true}, // Время активации
		sdate: {type: Date, 'default': Date.now, required: true, index: true}, // Время для сортировки (например, новые должны быть всегда сверху в галерее пользователя)

		type: {type: String}, // like 'image/jpeg'
		format: {type: String}, // like 'JPEG'
		sign: {type: String},
		size: {type: Number},
		w: {type: Number}, //Оригинальная ширина
		h: {type: Number}, //Оригинальная высота
		ws: {type: Number}, //Стандартная ширина
		hs: {type: Number}, //Стандартная высота

		geo: {type: [Number], index: '2d'}, //Индексированный массив [lng, lat]

		//Нельзя сделать array вхождений в регионы, так как индекс по массивам не эффективен
		//http://docs.mongodb.org/manual/faq/indexes/#can-i-use-a-multi-key-index-to-support-a-query-for-a-whole-array
		//Поэтому делаем избыточные поля на каждый уровень региона, со sparse индексом
		r0: {type: Number, sparse: true},
		r1: {type: Number, sparse: true},
		r2: {type: Number, sparse: true},
		r3: {type: Number, sparse: true},
		r4: {type: Number, sparse: true},
		r5: {type: Number, sparse: true},

		s: {type: Number, index: true}, //Статус фотографии {0-новая, 1-готовая, 5-публичная, 7-деактивированная, 9-удаленная}

		dir: {type: String, 'default': ''},
		title: {type: String, 'default': ''},
		year: {type: Number, 'default': 2000},
		year2: {type: Number, 'default': 2000},
		address: {type: String},
		desc: {type: String},
		source: {type: String},
		author: {type: String},

		conv: {type: Boolean}, //Конвертируется
		convqueue: {type: Boolean}, //В очереди на конвертацию

		vdcount: {type: Number, index: true}, //Кол-во просмотров за день
		vwcount: {type: Number, index: true}, //Кол-во просмотров за неделю
		vcount: {type: Number, index: true}, //Кол-во просмотров всего
		ccount: {type: Number, index: true}, //Кол-во комментариев
		frags: [FragmentSchema], //Фрагменты с комментариями

		nocomments: {type: Boolean} //Запретить комментирование
	}),
	PhotoMapSchema = new Schema(
		{
			cid: {type: Number, index: {unique: true}},
			geo: {type: [Number], index: '2d'},
			file: {type: String, required: true},
			dir: {type: String, 'default': ''},
			title: {type: String, 'default': ''},
			year: {type: Number, 'default': 2000},
			year2: {type: Number, 'default': 2000}
		},
		{collection: 'photos_map', strict: true}
	),

	PhotoConveyerSchema = new Schema(
		{
			cid: {type: Number, index: true},
			added: {type: Date, 'default': Date.now, required: true, index: true},
			variants: [String], // Версии, которые необходимо конвертировать
			converting: {type: Boolean}
		},
		{
			collection: 'photos_conveyer',
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
			collection: 'photos_conveyer_errors',
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

//В основной коллекции фотографий индексируем выборку координат по годам для выборки на карте
//Compound index http://docs.mongodb.org/manual/core/geospatial-indexes/#compound-geospatial-indexes
PhotoNewSchema.index({g: '2d', year: 1});
PhotoNewSchema.index({r0: 1, sdate: 1});
PhotoNewSchema.index({r1: 1, sdate: 1});
PhotoNewSchema.index({r2: 1, sdate: 1});
PhotoNewSchema.index({r3: 1, sdate: 1});
PhotoNewSchema.index({r4: 1, sdate: 1});
PhotoNewSchema.index({r5: 1, sdate: 1});


PhotoNewSchema.pre('save', function (next) {
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


module.exports.makeModel = function (db) {
	db.model('Photo', PhotoNewSchema);
	db.model('PhotoMap', PhotoMapSchema);

	db.model('PhotoConveyer', PhotoConveyerSchema);
	db.model('PhotoConveyerError', PhotoConveyerErrorSchema);
	db.model('STPhotoConveyer', STPhotoConveyerSchema);
};

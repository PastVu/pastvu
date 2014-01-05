'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var RegionSchema = new Schema(
	{
		cid: {type: Number, index: {unique: true}},
		parents: [Number], //Родительские регионы, если есть
		geo: Schema.Types.Mixed,

		pointsnum: {type: Number, index: true}, //Количество точек
		center: {type: [Number], index: '2d'}, //Координаты центра региона
		centerAuto: {type: Boolean, 'default': true, required: true}, //Центр расчитывается автоматически или устанавливается вручную(false)

		cdate: {type: Date, 'default': Date.now, required: true, index: true}, //Дата создания
		udate: {type: Date, 'default': Date.now, required: true}, //Дата изменения

		title_en: {type: String},
		title_local: {type: String}
	},
	{
		strict: true
	}
);
RegionSchema.index({geo: '2dsphere'});

module.exports.makeModel = function (db) {
	db.model('Region', RegionSchema);
};

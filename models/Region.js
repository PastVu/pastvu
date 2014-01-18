'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var RegionSchema = new Schema(
	{
		cid: {type: Number, index: {unique: true}},
		parents: [Number], //Родительские регионы, если есть
		geo: Schema.Types.Mixed,

		pointsnum: {type: Number, index: true}, //Количество точек
		polynum: {type: Schema.Types.Mixed, 'default': {}}, //Кол-во полигонов {exterior: N, interior: N}
		center: {type: [Number], index: '2d'}, //Координаты центра региона
		centerAuto: {type: Boolean, 'default': true, required: true}, //Центр расчитывается автоматически или устанавливается вручную(false)

		bbox: {type: [Number]}, //Bounding box региона http://geojson.org/geojson-spec.html#bounding-boxes
		bboxhome: {type: [Number]}, //Bounding box для выбора зума на карте пользователя. Если равен bbox - значит установлен автоматически, если нет - вручную

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

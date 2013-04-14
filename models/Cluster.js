'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var ClusterPoster = {
		cid: {type: Number},
		geo: {type: [Number]},
		file: {type: String},
		dir: {type: String},
		title: {type: String},
		year: {type: Number},
		year2: {type: Number}
	},
	ClusterSchema = new Schema(
		{
			g: {type: [Number]}, // Координаты левого верхнего угла кластера (Индексируется)
			z: {type: Number}, // Зум кластера (Индексируется)

			geo: {type: [Number]}, // Координаты центра тяжести кластера
			c: {type: Number}, // Количество фотографий в кластере
			y: {type: Schema.Types.Mixed}, // Хэш лет
			p: ClusterPoster // Обложка кластера
		},
		{
			strict: true
		}
	),
	ClusterParamsSchema = new Schema(
		{
			z: {type: Number, index: { unique: true }}, // Зум кластера
			w: {type: Number}, // Ширина кластера в градусах
			h: {type: Number}, // Высота кластера в градусах

			// Эти поля общие для всех параметров, так что такой документ в коллекции будет один
			sgeo: {type: [Number]}, // [lng, lat] центра расчетного кластера
			sz: {type: Number}, // Зум, с которого считали кластеры
			sw: {type: Number}, // Ширина кластера в пикселях
			sh: {type: Number}, // Высота кластера в пикселях
			gravity: {type: Boolean}
		},
		{
			strict: true
		}
	);

ClusterSchema.index({ g: '2d', z: 1 }); // Compound index   http://docs.mongodb.org/manual/core/geospatial-indexes/#compound-geospatial-indexes


module.exports.makeModel = function (db) {
	db.model('Cluster', ClusterSchema);
	db.model('ClusterParams', ClusterParamsSchema);
};

'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var RegionSchema = new Schema(
	{
		cid: {type: Number, index: {unique: true}},
		parent: {type: Number, index: true}, //Родительский cid, если level > 0

		geo: Schema.Types.Mixed,
		level: {type: Number, 'default': 0}, //0 - Страна, 1 - Субъект

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

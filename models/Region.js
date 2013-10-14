'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var RegionSchema = new Schema(
		{
			cid: {type: Number, index: { unique: true }},
			geo: {type: [Number], index: {type: '2dsphere'}},
			title: {type: Schema.Types.Mixed}
		},
		{
			strict: true
		}
	);


module.exports.makeModel = function (db) {
	db.model('Region', RegionSchema);
};

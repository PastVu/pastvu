'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	Counter = require('mongoose').model('Counter');

var CommentSheme = new mongoose.Schema(
	{
		cid: {type: Number, index: { unique: true }},
		photo: {type: Schema.Types.ObjectId, ref: 'Photo', index: true},
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
		stamp: {type: Date, 'default': Date.now, required: true, index: true},
		txt: {type: String},
		parent: {type: Number},
		frag: {type: String}
	},
	{
		strict: true
	}
);

module.exports.makeModel = function (db) {
	db.model('Comment', CommentSheme);
};

/*
 Counter.findOne({_id: 'photo'}, function (err, doc) {
 if (!doc) {
 Counter.update({_id: 'photo'}, {$inc: { next: 1 }}, {upsert: true}, function (err) { if (err) { console.log('Counter photo' + err); } });
 }
 });*/

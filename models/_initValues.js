'use strict';

var mongoose = require('mongoose');

mongoose.Model.saveUpsert = function (findQuery, properties, cb) {
	this.findOne(findQuery, function (err, doc) {
		if (err && cb) {
			cb(err);
		}
		if (!doc) {
			doc = new this(findQuery);
		}
		for (var p in properties) {
			if (properties.hasOwnProperty(p)) {
				doc[p] = properties[p];
			}
		}
		doc.save(!cb ? undefined : function (err, doc) {
			if (err) {
				cb(err);
				return;
			}
			cb(null, doc);
		});
	}.bind(this));
};

module.exports.makeModel = function (db) {

    var Settings = db.model('Settings');

    Settings.saveUpsert({key: 'USE_OSM_API'}, {val: true, desc: 'OSM Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    Settings.saveUpsert({key: 'USE_YANDEX_API'}, {val: true, desc: 'Yandex Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    Settings.saveUpsert({key: 'REGISTRATION_ALLOWED'}, {val: true, desc: 'Open self-registration of new users'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
};




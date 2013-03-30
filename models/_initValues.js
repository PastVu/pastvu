'use strict';

var mongoose = require('mongoose'),
    Utils = require('../commons/Utils.js');

module.exports.makeModel = function (db) {

    var Settings = db.model('Settings'),
        Role = db.model('Role'),
        User = db.model('User'),
        UserConfirm = db.model('UserConfirm'),
        Photo = db.model('Photo');

    Settings.saveUpsert({key: 'USE_OSM_API'}, {val: true, desc: 'OSM Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    Settings.saveUpsert({key: 'USE_YANDEX_API'}, {val: true, desc: 'Yandex Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    Settings.saveUpsert({key: 'REGISTRATION_ALLOWED'}, {val: true, desc: 'Open self-registration of new users'}, function (err) {
        if (err) console.log('Settings ' + err);
    });

    Role.saveUpsert({name: 'anonymous'}, {level: 0, comment: 'Role for unregistered users'}, function (err, doc) {
        if (err) console.log('Role ' + err);
    });
    Role.saveUpsert({name: 'registered'}, {level: 1, comment: 'Registered user'}, function (err, doc) {
        if (err) console.log('Role ' + err);
    });
    Role.saveUpsert({name: 'spec'}, {level: 4, comment: 'Special account'}, function (err, doc) {
        if (err) console.log('Role ' + err);
    });
    Role.saveUpsert({name: 'moderator'}, {level: 10, comment: 'Moderator'}, function (err, doc) {
        if (err) console.log('Role ' + err);
    });
    Role.saveUpsert({name: 'admin'}, {level: 50, comment: 'Administrator'}, function (err, doc) {
        if (err) console.log('Role ' + err);
    });
    Role.saveUpsert({name: 'super_admin'}, {level: 100, comment: 'Super Administrator'}, function (err, role) {
        if (err || !role) {
            console.log('Role ' + err);
            return;
        }
        User.saveUpsert({cid: 0, login: 'init', email: 'oldmos2@gmail.com'}, {pass: 'init', active: true, roles: [role._id], city: 'Moscow', aboutme: 'Must be deactivated after the creation of human administrator'}, function (err, doc) {
            if (err) console.log('User ' + err);
        });
    });
};




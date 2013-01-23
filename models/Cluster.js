'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    _ = require('lodash');

var ClusterSheme = new mongoose.Schema(
    {
        geo: {type: [Number], index: '2d'}, // Координаты левого верхнего угла
        z: {type: Number, index: true}, // Зум кластера
        c: {type: Number}, // Количество фотографий в кластере
        p : [{ type: Schema.Types.ObjectId, ref: 'Photo' }] // Массив id фотографий в кластере
    },
    {
        strict: true
    }
);


module.exports.makeModel = function (db) {
    db.model('Cluster', ClusterSheme);
};

'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    _ = require('lodash');

var ClusterSheme = new mongoose.Schema(
        {
            geo: {type: [Number], index: '2d'}, // Координаты левого верхнего угла
            //rel: {type: [Number]}, // Координаты левого верхнего угла (множитель отнсительно 0,0) для справки
            z: {type: Number, index: true}, // Зум кластера
            c: {type: Number}, // Количество фотографий в кластере
            p: [
                { type: Schema.Types.ObjectId, ref: 'Photo' } // Массив id фотографий в кластере
            ]
        },
        {
            strict: true
        }
    ),
    ClusterParamsSheme = new mongoose.Schema(
        {
            z: {type: Number, index: { unique: true }}, // Зум кластера
            w: {type: Number}, // Ширина кластера в градусах
            h: {type: Number}, // Высота кластера в градусах

            // Эти поля общие для всех параметров, так что такой документ в коллекции будет один
            sgeo: {type: [Number]}, // [lng, lat] центра расчетного кластера
            sz: {type: Number}, // Зум, с которого считали кластеры
            sw: {type: Number}, // Ширина кластера в пикселях
            sh: {type: Number} // Высота кластера в пикселях
        },
        {
            strict: true
        }
    );


module.exports.makeModel = function (db) {
    db.model('Cluster', ClusterSheme);
    db.model('ClusterParams', ClusterParamsSheme);
};

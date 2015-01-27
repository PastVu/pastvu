/**
 * Модель статусов фотографии
 */
define(['underscore'], function (_) {
    'use strict';

    var fields = {
        s: 'Статус',
        y: 'Год',
        geo: 'Координаты',
        regions: 'Регион',
        title: 'Название фотографии',
        desc: 'Описание',
        source: 'Источник',
        author: 'Автор',
        address: 'Адрес точки съемки',
        dir: 'Направление съемки',
        dirVals: {
            n: 'Север',
            ne: 'Северо-Восток',
            e: 'Восток',
            se: 'Юго-Восток',
            s: 'Юг',
            sw: 'Юго-Запад',
            w: 'Запад',
            nw: 'Северо-Запад',
            aero: 'Аэро/Спутник'
        },
        dirValsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero']
    };

    return fields;
});
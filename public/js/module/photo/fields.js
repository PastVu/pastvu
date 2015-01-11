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
        address: 'Адрес точки сьемки'
    };

    return fields;
});
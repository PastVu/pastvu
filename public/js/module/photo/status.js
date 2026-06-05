/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'i18n'], function (_, i18n) {
    'use strict';

    const statuses = {
        NEW: { // Новое
            num: 0,
            title: i18n('Новая фотография. Должна быть заполнена и отправлена на премодерацию для публикации'),
            title_owner: i18n('Новая фотография. Заполните необходимую информацию и отправьте на премодерацию для публикации'),
            filter_title: i18n('Новые'),
            action: i18n('Загружена пользователем'),
            tip: i18n('Новая загруженная фотография'),
            icon: 'glyphicon-asterisk',
            icon_history: 'glyphicon-cloud-upload',
            label: 'success',
            color: '#333',
        },
        REVISION: { // На доработке
            num: 1,
            title: i18n('Информация о фотографии должна быть доработана по требованию модератора'),
            title_owner: i18n('Вам необходимо доработать информацию о фотографии согласно требованиям модератора и снова отправить на публикацию'),
            filter_title: i18n('На доработке'),
            action: i18n('Отправлена на доработку'),
            tip: i18n('На доработке'),
            icon: 'glyphicon-repeat',
            label: 'warning',
            color: '#e99100',
        },
        READY: { // Ожидает публикации
            num: 2,
            title: i18n('Фотография находится на премодерации в ожидании публикации'),
            tip: i18n('Готово к публикации'),
            action: i18n('Отправлена на премодерацию для публикации'),
            filter_title: i18n('Готовые'),
            icon: 'glyphicon-flag',
            label: 'success',
            color: '#5FA803',
        },
        REVOKE: { // Отозвано владельцем
            num: 3,
            title: i18n('Фотография отозвана загрузившим пользователем до публикации'),
            title_owner: i18n('Вы отозвали фотографию'),
            filter_title: i18n('Отозванные'),
            action: i18n('Отозвана пользователем'),
            tip: i18n('Отозвана'),
            icon: 'glyphicon-remove-circle',
            label: 'default',
            color: '#999',
        },
        REJECT: { // Отклонено
            num: 4,
            title: i18n('Фотография отклонена модератором'),
            filter_title: i18n('Отклоненные'),
            action: i18n('Отклонена'),
            tip: i18n('Отклонена'),
            icon: 'glyphicon-ban-circle',
            label: 'danger',
            color: '#c60c1a',
        },
        PUBLIC: { // Опубликованное
            num: 5,
            filter_title: i18n('Публичные'),
            action: i18n('Опубликована'),
            icon_history: 'glyphicon-globe',
            color: '#0a6d04',
        },
        DEACTIVATE: { // Деактивировано
            num: 7,
            title: i18n('Фотография деактивирована'),
            title_owner: i18n('Ваша фотография деактивирована. Только вы и модераторы можете видеть изображение и редактировать страницу'),
            filter_title: i18n('Неактивные'),
            action: i18n('Деактивирована'),
            tip: i18n('Фотография неактивна'),
            icon: 'glyphicon-lock',
            label: 'warning',
            color: '#e99100',
        },
        REMOVE: { // Удалено
            num: 9,
            title: i18n('Фотография удалена'),
            title_owner: i18n('Ваша фотография удалена.<br>Только вы можете видеть изображение и только администрация может редактировать информацию на этой странице'),
            filter_title: i18n('Удаленные'),
            action: i18n('Удалена'),
            tip: i18n('Фотография удалена'),
            icon: 'glyphicon-trash',
            label: 'danger',
            color: '#c60c1a',
        },
    };
    const keys = {}; // Ключ - число. { NEW: 0 }
    const nums = {}; // Число - статус. { '0': {} }

    _.forOwn(statuses, function (status, key) {
        if (!status.title_owner) {
            status.title_owner = status.title;
        }

        keys[key] = status.num;
        nums[status.num] = status;
    });

    statuses.keys = keys;
    statuses.nums = nums;
    statuses.type = {
        PHOTO: 1,
        PAINTING: 2,
    };
    statuses.years = {
        1: { min: 1826, max: 2000 },
        2: { min: -100, max: 1980 },
    };

    return statuses;
});

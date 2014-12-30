/**
 * Модель статусов фотографии
 */
define(['underscore'], function (_) {
    'use strict';

    var statuses = {
        NEW: { // Новое
            num: 0,
            title: 'Новая фотография. Должна быть заполнена и отправлена на премодерацию для публикации',
            title_owner: 'Новая фотография. Заполните необходимую информацию и отправьте на премодерацию для публикации',
            filter_title: 'Новые',
            tip: 'Новая фотография',
            icon: 'glyphicon-asterisk',
            label: 'success',
            color: '#03a81c'
        },
        REVISION: { // На доработке
            num: 1,
            title: 'Информация о фотографии должна быть доработана по требованию модератора',
            title_owner: 'Вам необходимо доработать информацию о фотографии согласно требованиям модератора и снова отправить на публикацию',
            filter_title: 'На доработке',
            tip: 'На доработке',
            icon: 'glyphicon-repeat',
            label: 'warning',
            color: '#e99100'
        },
        READY: { // Ожидает публикации
            num: 2,
            title: 'Фотография находится на премодерации в ожидании публикации',
            tip: 'Готово к публикации',
            filter_title: 'Готовые',
            icon: 'glyphicon-flag',
            label: 'success',
            color: '#03a81c'
        },
        REVOKE: { // Отозвано владельцем
            num: 3,
            title: 'Фотография отозвана загрузившим пользователем до публикации',
            title_owner: 'Вы отозвали фотографию',
            filter_title: 'Отозванные',
            tip: 'Отозвана',
            icon: 'glyphicon-remove-circle',
            label: 'default',
            color: '#999'
        },
        REJECT: { // Отклонено
            num: 4,
            title: 'Фотография отклонена модератором',
            filter_title: 'Отклоненные',
            tip: 'Отклонена',
            icon: 'glyphicon-ban-circle',
            label: 'danger',
            color: '#c60c1a'
        },
        PUBLIC: { // Опубликованное
            num: 5,
            filter_title: 'Публичные'
        },
        DEACTIVATE: { // Деактивировано
            num: 7,
            title: 'Фотография деактивирована',
            title_owner: 'Фотография деактивирована. Только вы и модераторы можете видеть её и редактировать',
            filter_title: 'Неактивные',
            tip: 'Фотография неактивна',
            icon: 'glyphicon-lock',
            label: 'warning',
            color: '#e99100'
        },
        REMOVE: { // Удалено
            num: 9,
            title: 'Фотография удалена',
            title_owner: 'Фотография удалена. Только вы и модераторы можете видеть её',
            filter_title: 'Удаленные',
            tip: 'Фотография удалена',
            icon: 'glyphicon-trash',
            label: 'danger',
            color: '#c60c1a'
        }
    };
    var keys = {}; // Ключ - число. { NEW: 0 }
    var nums = {}; // Число - статус. { '0': {} }

    _.forOwn(statuses, function (status, key) {
        if (!status.title_owner) {
            status.title_owner = status.title;
        }
        keys[key] = status.num;
        nums[status.num] = status;
    });

    statuses.keys = keys;
    statuses.nums = nums;

    return statuses;
});
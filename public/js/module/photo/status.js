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
            tip: 'Новая фотография',
            icon: 'glyphicon-asterisk',
            label: 'success',
            color: '#03a81c'
        },
        REVISION: { // На доработке
            num: 1,
            title: 'Информация о фотографии должна быть доработана по требованию модератора',
            title_owner: 'Вам необходимо доработать информацию о фотографии согласно требованиям модератора и снова отправить на публикацию',
            tip: 'На доработке',
            icon: 'glyphicon-repeat',
            label: 'warning',
            color: '#e99100'
        },
        READY: { // Ожидает публикации
            num: 2,
            title: 'Фотография находится на премодерации в ожидании публикации',
            tip: 'Готово к публикации',
            icon: 'glyphicon-flag',
            label: 'success',
            color: '#03a81c'
        },
        REVOKE: { // Отозвано владельцем
            num: 3,
            title: 'Фотография отозвана загрузившим пользователем до публикации',
            title_owner: 'Вы отозвали фотографию',
            tip: 'Отозвана',
            icon: 'glyphicon-remove-circle',
            label: 'default',
            color: '#999'
        },
        REJECT: { // Отклонено
            num: 4,
            title: 'Фотография отклонена модератором',
            tip: 'Отклонена',
            icon: 'glyphicon-ban-circle',
            label: 'danger',
            color: '#c60c1a'
        },
        PUBLIC: { // Опубликованное
            num: 5
        },
        DEACTIVATE: { // Деактивировано
            num: 7,
            title: 'Фотография деактивирована',
            title_owner: 'Фотография деактивирована. Только вы и модераторы можете видеть её и редактировать',
            tip: 'Фотография неактивна',
            icon: 'glyphicon-lock',
            label: 'warning',
            color: '#e99100'
        },
        REMOVE: { // Удалено
            num: 9,
            title: 'Фотография удалена',
            title_owner: 'Фотография удалена. Только вы и модераторы можете видеть её',
            tip: 'Фотография удалена',
            icon: 'glyphicon-trash',
            label: 'danger',
            color: '#c60c1a'
        }
    };

    statuses.keys = {}; // Ключ - число. { NEW: 0 }
    statuses.nums = {}; // Число - статус. { '0': {} }
    _.each(statuses, function (status, key) {
        if (!status.title_owner) {
            status.title_owner = status.title;
        }
        statuses.keys[key] = status.num;
        statuses.nums[status.num] = status;
    });

    return statuses;
});
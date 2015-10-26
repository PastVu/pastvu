/**
 * Модель статусов фотографии
 */
define(['underscore'], function (_) {
    'use strict';

    var statuses = {
        NEW: { // Новое
            num: 0,
            title: 'New photo. Must be filled and sended to premoderation for further publishing',
            title_owner: 'New photo. Fill necessary information and send it to premoderation for further publishing',
            filter_title: 'New',
            action: 'Uploaded by user',
            tip: 'New uploaded photo',
            icon: 'glyphicon-asterisk',
            icon_history: 'glyphicon-cloud-upload',
            label: 'success',
            color: '#333'
        },
        REVISION: { // На доработке
            num: 1,
            title: 'Photo information should be modified by moderator\'s request',
            title_owner: 'You ought to modify onformation about the photo as required by the moderator and then send for publication again',
            filter_title: 'On revision',
            action: 'Returned for revision',
            tip: 'On revision',
            icon: 'glyphicon-repeat',
            label: 'warning',
            color: '#e99100'
        },
        READY: { // Ожидает публикации
            num: 2,
            title: 'Photo is on the premoderation in anticipation of the publication',
            tip: 'Ready to publish',
            action: 'Sent to premoderation for publishing',
            filter_title: 'Ready',
            icon: 'glyphicon-flag',
            label: 'success',
            color: '#5FA803'
        },
        REVOKE: { // Отозвано владельцем
            num: 3,
            title: 'Photo is revoked by user before publishing',
            title_owner: 'You revoked this photo',
            filter_title: 'Revoked',
            action: 'Revoked by user',
            tip: 'Revoked',
            icon: 'glyphicon-remove-circle',
            label: 'default',
            color: '#999'
        },
        REJECT: { // Отклонено
            num: 4,
            title: 'Photo is reject by the moderator',
            filter_title: 'Reject',
            action: 'Rejected',
            tip: 'Rejected',
            icon: 'glyphicon-ban-circle',
            label: 'danger',
            color: '#c60c1a'
        },
        PUBLIC: { // Опубликованное
            num: 5,
            filter_title: 'Public',
            action: 'Published',
            icon_history: 'glyphicon-globe',
            color: '#0a6d04'
        },
        DEACTIVATE: { // Деактивировано
            num: 7,
            title: 'Photo is deactivated',
            title_owner: 'Photo is deactivated. Only you and moderators can see and edit it',
            filter_title: 'Inactive',
            action: 'Deactivated',
            tip: 'Photo is inactive',
            icon: 'glyphicon-lock',
            label: 'warning',
            color: '#e99100'
        },
        REMOVE: { // Удалено
            num: 9,
            title: 'Photo is removed',
            title_owner: 'Photo is removed. Only you and moderators can see it',
            filter_title: 'Removed',
            action: 'Removed',
            tip: 'Photo is removed',
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
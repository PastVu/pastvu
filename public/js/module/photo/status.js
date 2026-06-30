/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'i18n'], function (_, i18n) {
    'use strict';

    const statuses = {
        NEW: { // Новое
            num: 0,
            title: i18n('New photo. It must be filled in and submitted for moderation before it can be published'),
            title_owner: i18n('New photo. Fill in the required information and submit it for moderation to publish'),
            filter_title: i18n('New'),
            action: i18n('Uploaded by user'),
            tip: i18n('Newly uploaded photo'),
            icon: 'glyphicon-asterisk',
            icon_history: 'glyphicon-cloud-upload',
            label: 'success',
            color: '#333',
        },
        REVISION: { // На доработке
            num: 1,
            title: i18n('The photo information must be revised at the moderator\'s request'),
            title_owner: i18n('You must revise the photo information per the moderator\'s requirements and resubmit it for publication'),
            filter_title: i18n('Awaiting revision'),
            action: i18n('Sent for revision'),
            tip: i18n('Awaiting revision'),
            icon: 'glyphicon-repeat',
            label: 'warning',
            color: '#e99100',
        },
        READY: { // Ожидает публикации
            num: 2,
            title: i18n('The photo is in pre-moderation awaiting publication'),
            tip: i18n('Ready to publish'),
            action: i18n('Submitted for moderation'),
            filter_title: i18n('Ready'),
            icon: 'glyphicon-flag',
            label: 'success',
            color: '#5FA803',
        },
        REVOKE: { // Отозвано владельцем
            num: 3,
            title: i18n('The photo was withdrawn by the uploader before publication'),
            title_owner: i18n('You withdrew the photo'),
            filter_title: i18n('Withdrawn'),
            action: i18n('Withdrawn by user'),
            tip: i18n('Photo withdrawn'),
            icon: 'glyphicon-remove-circle',
            label: 'default',
            color: '#999',
        },
        REJECT: { // Отклонено
            num: 4,
            title: i18n('The photo was rejected by a moderator'),
            filter_title: i18n('Rejected'),
            action: i18n('Photo rejected'),
            tip: i18n('Photo rejected'),
            icon: 'glyphicon-ban-circle',
            label: 'danger',
            color: '#c60c1a',
        },
        PUBLIC: { // Опубликованное
            num: 5,
            filter_title: i18n('Public photos'),
            action: i18n('Published'),
            icon_history: 'glyphicon-globe',
            color: '#0a6d04',
        },
        DEACTIVATE: { // Деактивировано
            num: 7,
            title: i18n('Photo deactivated'),
            title_owner: i18n('Your photo is deactivated. Only you and moderators can see the image and edit the page'),
            filter_title: i18n('Inactive'),
            action: i18n('Deactivated'),
            tip: i18n('Photo is inactive'),
            icon: 'glyphicon-lock',
            label: 'warning',
            color: '#e99100',
        },
        REMOVE: { // Удалено
            num: 9,
            title: i18n('Photo removed'),
            title_owner: i18n('Your photo has been removed.<br>Only you can see the image, and only administrators can edit the information on this page'),
            filter_title: i18n('Removed'),
            action: i18n('Photo removed'),
            tip: i18n('Photo removed'),
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

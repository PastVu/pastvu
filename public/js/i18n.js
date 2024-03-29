/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['knockout', 'knockout.mapping'], function (ko, koMapping) {
    'use strict';

    const i18n = {
        en: {
            login: 'Login',
            logout: 'Logout',
            register: 'Registration',
            mod: 'Moderation',
            admin: 'Administration',
            gallery: 'Gallery',
            image_upload: 'Upload Image',
        },
        ru: {
            login: 'Вход',
            logout: 'Выход',
            register: 'Регистрация',
            mod: 'Модерирование',
            admin: 'Админ',
            gallery: 'Галерея',
            image_upload: 'Загрузить фото',
        },
    };

    return koMapping.fromJS(i18n.ru);
});

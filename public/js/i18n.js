/**
 * Localizations
 */
define(['knockout', 'knockout.mapping'], function (ko, koMapping) {
    'use strict';

    const i18n = {
        en: {
            login: 'Log In',
            logout: 'Log Out',
            register: 'Sign Up',
            mod: 'Moderation',
            admin: 'Administration',
            gallery: 'Gallery',
            image_upload: 'Upload',
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

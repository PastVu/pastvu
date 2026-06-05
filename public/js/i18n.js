/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['i18next', 'Params'], function (i18next, P) {
    'use strict';

    i18next.init({
        lng: P.settings && P.settings.lang || 'ru',
        fallbackLng: 'ru',
        // Keys are Russian source strings; turn off separators so dots/colons in a key
        // are not interpreted as namespace/key paths.
        keySeparator: false,
        nsSeparator: false,
        // Knockout escapes text bindings — don't double-escape.
        interpolation: { escapeValue: false },
        resources: {
            ru: { translation: {} },
            en: {
                translation: {
                    'Вход': 'Login',
                    'Выход': 'Logout',
                    'Регистрация': 'Sign up',
                    'Модерирование': 'Moderation',
                    'Админ': 'Admin',
                    'Галерея': 'Gallery',
                    'Загрузить фото': 'Upload photo',
                    'Поддержка: support@pastvu.com': 'Support: support@pastvu.com',
                    'Правила': 'Rules',
                    'О проекте': 'About',
                    'Закрыть': 'Close',
                },
            },
        },
    });

    return i18next.t.bind(i18next);
});

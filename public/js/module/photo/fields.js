/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['m/photo/status'], function () {
    return {
        s: 'Статус',
        y: 'Год',
        geo: 'Координаты',
        type: 'Тип',
        regions: 'Регион',
        title: 'Название фотографии',
        desc: 'Описание',
        source: 'Источник',
        author: 'Автор',
        address: 'Адрес точки съемки',
        dir: 'Направление съемки',
        typeVals: {
            1: 'Фотография',
            2: 'Картина/рисунок',
        },
        types: ['1', '2'],
        dirVals: {
            n: 'Север',
            ne: 'Северо-Восток',
            e: 'Восток',
            se: 'Юго-Восток',
            s: 'Юг',
            sw: 'Юго-Запад',
            w: 'Запад',
            nw: 'Северо-Запад',
            aero: 'Аэро/Спутник',
        },
        dirIcons: {
            n: '&#xf1e0;',
            ne: '&#xf1e1;',
            e: '&#xf1df;',
            se: '&#xf1e4;',
            s: '&#xf1e3;',
            sw: '&#xf1e5;',
            w: '&#xf1e6;',
            nw: '&#xf1e2;',
            aero: '&#xe3f7;',
        },
        dirValsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'],
        watersign: {
            'title': 'Подпись на вотермарке',
            'profile': 'Как указано в профиле',
            'individual': 'Индивидуально',
            'option': 'Добавлять подпись на вотермарк',
            'default': 'Настройки системы',
            'text': 'Текст',
        },
        watersignText: 'Подпись на вотермарке',
        watersignLength: 65,
        watersignPattern: /[\w\.,:;\(\)\[\]\\\|/№§©®℗℠™•\?!@#\$%\^&\*\+\-={}"'<>~` ]/g, //eslint-disable-line no-useless-escape
        downloadOrigin: {
            title: 'Скачивание оригинала',
            profile: 'Как указано в профиле',
            individual: 'Индивидуально',
            option: 'Разрешать другим пользователям скачивать оригинал',
        },

        painting: {
            title: 'Название',
        },
    };
});

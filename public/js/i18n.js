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
                    'Выключить фильтр': 'Disable filter',
                    'Включить фильтр': 'Enable filter',
                    'Регионы:': 'Regions:',
                    'Весь мир': 'Whole world',
                    'Перейти в редактирование региона': 'Edit region',
                    'Оставить активным только этот регион': 'Keep only this region active',
                    'Переключить активность этого региона': 'Toggle this region',
                    'Удалить регион': 'Remove region',
                    'Удалить остальные регионы': 'Remove other regions',
                    'Активировать все регионы': 'Activate all regions',
                    'Деактивировать все регионы': 'Deactivate all regions',
                    'Удалить все регионы': 'Remove all regions',
                    'Удалить все исключающие регионы': 'Remove all excluding regions',
                    'Изменить': 'Edit',
                    'Выбрать': 'Select',
                    'Изображения привязаны также к подрегионам:': 'Images are also linked to subregions:',
                    'Нет': 'No',
                    'Да': 'Yes',
                    'Изображения которые привязаны только<br>непосредственно к выбранным регионам': 'Images linked only<br>directly to the selected regions',
                    'Изображения которые также привязаны<br>к потомкам выбранных регионов': 'Images also linked<br>to descendants of the selected regions',
                    'кроме:': 'except:',
                    'Изображение имеет координату:': 'Image has coordinates:',
                    'Раздел «Где это?»': '«Where is this?» section',
                    'Годы:': 'Years:',
                    'Сбросить диапазон лет': 'Reset year range',
                    'Тип:': 'Type:',
                    'Фотография': 'Photograph',
                    'Картина/Рисунок': 'Painting/Drawing',
                    'Комментарии:': 'Comments:',
                    'Есть от': 'At least',
                    'Статусы:': 'Statuses:',
                    'Кликните, чтобы войти или зарегистрироваться': 'Click to log in or sign up',
                    'Войдите, чтобы видеть больше': 'Log in to see more',
                    'Постранично': 'Pages',
                    'Лента': 'Feed',
                    'Монета': 'Coin',
                    'Подбросить монетку': 'Flip the coin',
                    'Добавить..': 'Add..',
                    'Это ваша фотография': 'This is your photo',
                    'Комментарии': 'Comments',
                    'Фотография изменена с момента прошлого просмотра': 'Photo changed since last view',
                    'Загрузка': 'Loading',
                    'Первая страница': 'First page',
                    'Предыдущая страница': 'Previous page',
                    'Следующая страница': 'Next page',
                    'Последняя страница': 'Last page',
                    'Дополнительная информация': 'Additional information',
                    'Дополнительная информация (опционально)': 'Additional information (optional)',
                    'Разместить в социальных сетях': 'Share on social networks',
                    'Ссылка на страницу': 'Page link',
                    'Ссылка на изображение': 'Image link',
                    'Скопировать адрес в буфер обмена': 'Copy address to clipboard',
                },
            },
        },
    });

    return i18next.t.bind(i18next);
});

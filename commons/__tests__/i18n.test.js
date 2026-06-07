/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { getT, t } from '../i18n';

describe('commons/i18n', () => {
    describe('t(lang, key)', () => {
        it('returns the English translation for a known Russian key', () => {
            expect(t('en', 'Вход')).toBe('Login');
        });

        it('returns the Russian source key as-is when lang is ru', () => {
            expect(t('ru', 'Вход')).toBe('Вход');
        });

        it('returns the key unchanged when no translation exists', () => {
            expect(t('en', 'this-key-does-not-exist')).toBe('this-key-does-not-exist');
        });
    });

    describe('getT(lang)', () => {
        it('binds to a language so subsequent calls share it', () => {
            const tEn = getT('en');

            expect(tEn('Вход')).toBe('Login');
            expect(tEn('Выход')).toBe('Logout');
        });

        it('falls back to the default language for unsupported lang', () => {
            const tFr = getT('fr');

            // 'fr' is not in config.locales, so we fall back to config.lang ('ru'),
            // which has no entry for this key and therefore returns the key itself.
            expect(tFr('Вход')).toBe('Вход');
        });
    });

    describe('interpolation', () => {
        it('substitutes {{var}} placeholders', () => {
            // 'Установить карту в домашний регион {{region}}' →
            // 'Center map on home region {{region}}'
            expect(t('en', 'Установить карту в домашний регион {{region}}', { region: 'Москва' }))
                .toBe('Center map on home region Москва');
        });
    });

    describe('cldr plurals via t(lang, key, { count })', () => {
        it('resolves Russian one/few/many for comments_new', () => {
            expect(t('ru', 'comments_new', { count: 1 })).toBe('1 новый комментарий');
            expect(t('ru', 'comments_new', { count: 2 })).toBe('2 новых комментария');
            expect(t('ru', 'comments_new', { count: 4 })).toBe('4 новых комментария');
            expect(t('ru', 'comments_new', { count: 5 })).toBe('5 новых комментариев');
            expect(t('ru', 'comments_new', { count: 11 })).toBe('11 новых комментариев');
            expect(t('ru', 'comments_new', { count: 21 })).toBe('21 новый комментарий');
            expect(t('ru', 'comments_new', { count: 22 })).toBe('22 новых комментария');
        });

        it('resolves English one/other for comments_new', () => {
            expect(t('en', 'comments_new', { count: 1 })).toBe('1 new comment');
            expect(t('en', 'comments_new', { count: 2 })).toBe('2 new comments');
            expect(t('en', 'comments_new', { count: 21 })).toBe('21 new comments');
        });

        it('resolves comments_unread in both languages', () => {
            expect(t('ru', 'comments_unread', { count: 1 })).toBe('1 непрочитанный');
            expect(t('ru', 'comments_unread', { count: 5 })).toBe('5 непрочитанных');
            expect(t('en', 'comments_unread', { count: 1 })).toBe('1 unread');
            expect(t('en', 'comments_unread', { count: 5 })).toBe('5 unread');
        });

        it('handles count: 0 correctly in both languages', () => {
            expect(t('ru', 'comments_new', { count: 0 })).toBe('0 новых комментариев');
            expect(t('en', 'comments_new', { count: 0 })).toBe('0 new comments');
        });

        it('resolves photos_count in Russian and English', () => {
            expect(t('ru', 'photos_count', { count: 1 })).toBe('1 фотография');
            expect(t('ru', 'photos_count', { count: 3 })).toBe('3 фотографии');
            expect(t('ru', 'photos_count', { count: 5 })).toBe('5 фотографий');
            expect(t('en', 'photos_count', { count: 1 })).toBe('1 photo');
            expect(t('en', 'photos_count', { count: 5 })).toBe('5 photos');
        });

        it('resolves users_count, comments_count, views_count, users_registered_count', () => {
            expect(t('ru', 'users_count', { count: 2 })).toBe('2 пользователя');
            expect(t('ru', 'comments_count', { count: 11 })).toBe('11 комментариев');
            expect(t('ru', 'views_count', { count: 1 })).toBe('1 просмотр');
            expect(t('ru', 'users_registered_count', { count: 5 })).toBe('5 зарегистрированных');
            expect(t('en', 'users_count', { count: 1 })).toBe('1 user');
            expect(t('en', 'comments_count', { count: 2 })).toBe('2 comments');
        });

        it('thousand-separates count in plural keys per language', () => {
            const ruFmt = new Intl.NumberFormat('ru').format(1234);

            expect(t('ru', 'photos_count', { count: 1234 })).toBe(`${ruFmt} фотографии`);
            expect(t('en', 'photos_count', { count: 1234 })).toBe('1,234 photos');
        });
    });

    describe('built-in number formatter', () => {
        it('formats integers per language locale (ru)', () => {
            expect(t('ru', '{{n, number}}', { n: 1234 })).toBe(new Intl.NumberFormat('ru').format(1234));
            expect(t('ru', '{{n, number}}', { n: 0 })).toBe('0');
            expect(t('ru', '{{n, number}}', { n: 1 })).toBe('1');
        });

        it('formats integers per language locale (en)', () => {
            expect(t('en', '{{n, number}}', { n: 1234 })).toBe('1,234');
            expect(t('en', '{{n, number}}', { n: 1234567 })).toBe('1,234,567');
        });

        it('interpolates multiple number placeholders in one key', () => {
            expect(t('en', '{{a, number}} of {{b, number}}', { a: 100, b: 1000 })).toBe('100 of 1,000');
        });
    });

    describe('built-in datetime formatter via symbolic keys', () => {
        const sampleDate = new Date(2026, 5, 7, 14, 30, 45);

        it('datetime_full resolves to the full date+time format per language', () => {
            const ruFmt = new Intl.DateTimeFormat('ru', {
                dateStyle: 'full', timeStyle: 'medium', hourCycle: 'h23',
            }).format(sampleDate);
            const enFmt = new Intl.DateTimeFormat('en', {
                dateStyle: 'full', timeStyle: 'medium', hourCycle: 'h23',
            }).format(sampleDate);

            expect(t('ru', 'datetime_full', { date: sampleDate })).toBe(ruFmt);
            expect(t('en', 'datetime_full', { date: sampleDate })).toBe(enFmt);
        });

        it('(до {{date, datetime(...)}}) embeds short date+time formatter', () => {
            const ruFmt = new Intl.DateTimeFormat('ru', {
                dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23',
            }).format(sampleDate);
            const key = '(до {{date, datetime(dateStyle: short; timeStyle: medium; hourCycle: h23)}})';

            expect(t('ru', key, { date: sampleDate })).toBe(`(до ${ruFmt})`);
        });
    });

    describe('namespace resolution', () => {
        it('falls back from a sub-namespace to translation for shared keys', () => {
            // 'Вход' lives in translation. A mail call site that passes
            // { ns: 'mail' } finds it via fallbackNS.
            expect(t('en', 'Вход', { ns: 'mail' })).toBe('Login');
        });

        it('looks up explicit ns when the key is registered there', () => {
            // Use a key the test itself adds to the mail namespace so the
            // test stays valid before and after Task 4 moves keys.
            const i18next = require('i18next');

            i18next.addResource('en', 'mail', '__test_mail_only__', 'mail-only-value');

            expect(t('en', '__test_mail_only__', { ns: 'mail' })).toBe('mail-only-value');

            i18next.removeResourceBundle('en', 'mail');
        });

        it('default namespace resolution unchanged for regular calls', () => {
            // Sanity check: no ns option → defaultNS (= translation) lookup.
            expect(t('en', 'Вход')).toBe('Login');
            expect(t('ru', 'photos_count', { count: 5 })).toBe('5 фотографий');
        });
    });
});

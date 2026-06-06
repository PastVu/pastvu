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
    });
});

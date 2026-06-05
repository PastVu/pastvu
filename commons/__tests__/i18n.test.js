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
            // which has empty translations and therefore returns the key itself.
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
});

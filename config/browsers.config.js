/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

module.exports = function (config/* , appRequire */) {
    config.browsers = {

        // List of browsers and theirs versions (in semver format), for which will be displayed badbrowser page
        badbrowserList: {
            'IE': '<10.0.0',
            'Firefox': '<6.0.0', // 6th version it's G+
            'Opera': '<12.10.0',
            'Chrome': '<11.0.0', // 11th version it's an Android 4 default browser in desktop mode
            'Android': '<4.2.0',
            'Safari': '<6.0.0',
            'Mobile Safari': '<6.0.0',
        },

        // List of polyfills and browsers for which they will NOT be embedded
        // Starting from specified version (in semver format) polyfills will not be embedded
        // Browser, which is not presented in the list, or which version is below specified, will receive polyfill
        polyfillFreelist: {
            // http://caniuse.com/#search=intl
            'intl': {
                'IE': '>=11.0.0',
                'Edge': '>=12.0.0',
                'Safari': '>=10.0.0',
                'Firefox': '>=29.0.0',
                'Opera': '>=15.0.0',
                'Chrome': '>=24.0.0',
                'Android': '>=4.4.0',
                'Yandex Browser': '>=1.7.0',
            },
            // http://caniuse.com/#search=promise
            'promise': {
                'Edge': '>=12.0.0',
                'Firefox': '>=29.0.0',
                'Opera': '>=20.0.0',
                'Chrome': '>=33.0.0',
                'Android': '>=4.4.4',
                'Safari': '>=8.0.0',
                'Mobile Safari': '>=8.0.0',
                'Yandex Browser': '>=14.2.0',
            },
        },
    };

    return config;
};

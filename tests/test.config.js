/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// This configuration has the same purpose as local.config.js in normal run,
// but applied in test environment.
module.exports = function (config, appRequire) {
    const _ = appRequire('lodash');

    _.merge(config, {
        env: 'test',
        client: {
            hostname: 'test.local',
        },
        // It is important to flag instance as primary to avoid starting
        // region cache timer, which will prevent Jest from completing.
        primary: true,
    });

    return config;
};

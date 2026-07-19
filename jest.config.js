/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

export default {
    testEnvironment: 'node',
    transform: {},
    globalSetup: './tests/globalSetup.js',
    globalTeardown: './tests/globalTeardown.js',
    setupFilesAfterEnv: ['./tests/setup.js'],
};

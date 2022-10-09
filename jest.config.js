/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

module.exports = {
    testEnvironment: 'node',
    transform: {
        '\\.js$': ['babel-jest', { configFile: './babel/server.config.js' }],
    },
    globalSetup: './tests/globalSetup.js',
    globalTeardown: './tests/globalTeardown.js',
    setupFilesAfterEnv: ['./tests/setup.js'],
};

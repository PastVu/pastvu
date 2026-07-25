/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

module.exports = {
    testEnvironment: 'node',
    transform: {
        '\\.js$': ['babel-jest', { configFile: './babel/server.config.js' }],
    },
    // cookie@2 ships as ESM only, so let babel transpile it instead of ignoring it.
    transformIgnorePatterns: ['/node_modules/(?!(cookie)/)'],
    // migrate-mongo@14 is ESM-only; its CJS wrapper uses dynamic import(), which Jest's VM
    // can't run without --experimental-vm-modules. It is never exercised in tests (migration
    // checks are skipped when NODE_ENV === 'test'), so map it to a stub to keep imports working.
    moduleNameMapper: {
        '^migrate-mongo$': '<rootDir>/tests/__mocks__/migrate-mongo.js',
    },
    globalSetup: './tests/globalSetup.js',
    globalTeardown: './tests/globalTeardown.js',
    setupFilesAfterEnv: ['./tests/setup.js'],
};

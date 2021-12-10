module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    transform: {
        '\\.js$': ['babel-jest', { configFile: './babel/server.config.js' }],
    },
    globalSetup: './tests/globalSetup.js',
    globalTeardown: './tests/globalTeardown.js',
    setupFilesAfterEnv: ['./tests/setup.js'],
};

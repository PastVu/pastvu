module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    transform: {
        '\\.js$': ['babel-jest', { configFile: './babel/server.config.js' }],
    },
};

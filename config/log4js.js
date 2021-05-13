const path = require('path');

module.exports = function (config) {
    return {
        appenders: {
            file: {
                type: 'file',
                filename: path.join(config.logPath, 'all.log'),
                maxLogSize: 15728640,
                backups: 3,
            },
            errorFile: {
                type: 'file',
                filename: path.join(config.logPath, 'errors.log'),
                maxLogSize: 15728640,
                backups: 3,
            },
            errors: {
                type: 'logLevelFilter',
                level: 'error',
                appender: 'errorFile',
            },
        },
        categories: {
            default: {
                appenders: ['file', 'errors'],
                level: 'INFO',
            },
        },
    };
};

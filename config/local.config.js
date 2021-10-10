module.exports = function (config, appRequire) {
    const _ = appRequire('lodash');

    _.merge(config, {
        // Send periodical emails to users depending on environment variable
        notifier: true,
        primary: true,
        client: {
            hostname: 'localhost',
        },
        uploader: {
            hostname: 'uploader',
        },
        downloader: {
            hostname: 'downloader',
        },
        core: {
            hostname: 'app',
        },
        listen: {
            hostname: '',
        },

        storePath: '/store',

        mongo: {
            connection: 'mongodb://mongo:27017/pastvu',
        },
        mongo_api: {
            con: 'mongodb://mongo:27017/pastvu',
        },
        redis: {
            host: 'redis',
        },
        mail: {
            type: 'SMTP',
            host: 'mailcatcher',
            port: 1025,
        },
    });

    return config;
};

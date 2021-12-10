import { MongoMemoryServer } from 'mongodb-memory-server';

// Substitute alternate configuration.
process.argv.push('--config', __dirname + '/test.config.js');

// Define mongodb-memory-server version to use in tests.
process.env.MONGOMS_VERSION = '4.4.0';

export default async function () {
    // Start mongodb-memory-server.
    const instance = await MongoMemoryServer.create();

    global.__MONGOMSINSTANCE__ = instance; // eslint-disable-line no-underscore-dangle
    process.env.MONGO_INSTANCE_URI = instance.getUri();
}

import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.MONGOMS_VERSION = '4.4.0';

export default async function() {
    // Start mongodb-memory-server.
    const instance = await MongoMemoryServer.create();
    global.__MONGOMSINSTANCE__ = instance;
    process.env.MONGO_INSTANCE_URI = instance.getUri();
};

import connectDb, { waitDb } from '../controllers/connection';
import mongoose from 'mongoose';

jest.setTimeout(10000);

beforeAll(async () => {
    await connectDb({ mongo: { uri: process.env.MONGO_INSTANCE_URI } });
    await waitDb;
});

beforeEach(async () => {
    //await seedDatabase()
});

// Cleans up database between each test
afterEach(async () => {
    const collections = mongoose.connection.collections;

    for (const collectionName of Object.keys(collections)) {
        const collection = collections[collectionName];

        await collection.deleteMany();
    }
});

afterAll(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
});

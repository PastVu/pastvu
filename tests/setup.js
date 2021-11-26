import connectDb, { waitDb } from '../controllers/connection';
import mongoose from 'mongoose';

let mongoServer;

export default function setupDB(databaseName) {

    beforeAll(async () => {
        await connectDb({ mongo: { uri: process.env.MONGO_INSTANCE_URI } });
    });

    beforeEach(async () => {
        //await seedDatabase()
    });

    // Cleans up database between each test
    afterEach(async () => {
        const collections = mongoose.connection.collections;
        for (const collectionName in collections) {
           const collection = collections[collectionName];
           await collection.deleteMany();
        }
    });

    afterAll(async () => {
        await mongoose.connection.db.dropDatabase();
        await mongoose.connection.close();
    });
}

const mongoose = require('mongoose');

mongoose.set('useCreateIndex', true);
mongoose.promise = global.Promise;

export default function setupDB(databaseName) {

    beforeAll(async () => {
        const url = `mongodb://127.0.0.1/${databaseName}`;

        await mongoose.connect(url, { useNewUrlParser: true });
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

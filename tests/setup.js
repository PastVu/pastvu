import connectDb, { waitDb } from '../controllers/connection';
import mongoose from 'mongoose';
import { UserSettings } from '../models/UserSettings';

jest.setTimeout(10000);

// Runs before any of the tests in test file run.
beforeAll(async () => {
    await connectDb({ mongo: { uri: process.env.MONGO_INSTANCE_URI } });
    await waitDb;
    await seedDatabase();
});

beforeEach(async () => {
    // This would be the place to seed database, but we only have UserSettings
    // required so far, so no point to re-seed it before each test unless we
    // start modifying those settings one day.
    //await seedDatabase();
});

// Cleans up database between each test.
afterEach(async () => {
    const collections = mongoose.connection.collections;

    for (const collectionName of Object.keys(collections)) {
        // For now preserve UserSettings.
        if (collectionName !== 'UserSettings') {
            const collection = collections[collectionName];

            await collection.deleteMany();
        }
    }
});

// Close connection when all tests in the file are completed.
afterAll(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
});

async function seedDatabase() {
    // We should probably do this a bit smarter way in future, may be define
    // it in model and populate on init if collection is empty.

    // Populate UserSettings.
    await UserSettings.insertMany([
        { key: 'subscr_auto_reply', val: true, vars: [true, false], desc: 'Автоподписка при комментировании темы' },
        { key: 'subscr_throttle', val: 3 * 60 * 60 * 1000, vars: [5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000], desc: 'Минимальный интервал между отправками письма с уведомлением' },
        { key: 'ranks', vars: ['mec', 'mec_silv', 'mec_gold', 'adviser'], desc: 'Звания пользователя' },
        { key: 'r_f_photo_user_gal', val: true, vars: [true, false], desc: 'Фильтровать галерею пользователя на странице фото' },
        { key: 'r_f_user_gal', val: true, vars: [true, false], desc: 'Фильтровать галерею пользователя в его профиле' },
        { key: 'r_as_home', val: false, vars: [true, false], desc: 'Регион для фильтрации по умолчанию берётся из домашнего региона' },
        { key: 'photo_show_watermark', val: false, vars: [true, false], desc: 'Показывать вотермарк фотографии' },
        { key: 'photo_watermark_add_sign', val: true, vars: [true, false, 'custom'], desc: 'Add sign to watermark' },
        { key: 'photo_filter_type', val: [1, 2], vars: [1, 2], desc: 'Default filtering by photos type' },
        { key: 'comment_show_deleted', val: false, vars: [true, false], desc: 'Показывать удаленные комментарии' },
        { key: 'photo_disallow_download_origin', val: false, vars: [true, false], desc: 'Disallow others users to download photo without watermark' },
    ]);
}

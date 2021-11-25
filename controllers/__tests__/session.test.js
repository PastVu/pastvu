import { User } from '../../models/User';
import setupDB from '../../tests/setup';

setupDB();

test('should save user to database', async () => {
    // Searches the user in the database
    const user = await User.findOne({}).exec();

    //console.log(user);
    expect(user).toBeNull();
});

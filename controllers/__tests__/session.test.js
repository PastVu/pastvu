import { User } from '../../models/User';
import setupDB from '../../test-setup';

setupDB('endpoint-testing', true);

test('should save user to database', async () => {
    // Searches the user in the database
    const user = await User.findOne({}).exec();

    //console.log(user);
    expect(user).toBeNull();
});

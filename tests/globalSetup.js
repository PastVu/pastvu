/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

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

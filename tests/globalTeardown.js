/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

export default async function () {
    // Stop mongodb-memory-server.
    const instance = global.__MONGOMSINSTANCE__; // eslint-disable-line no-underscore-dangle

    await instance.stop();
}

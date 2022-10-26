/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Remove ranks from the settings collection. This is now defined as constant.
 */
module.exports = {
    async up(db/*, client*/) {
        await db.collection('user_settings').deleteOne({ key: 'ranks' });
    },

    async down(db/*, client*/) {
        await db.collection('user_settings').insertOne({ key: 'ranks', vars: ['mec', 'mec_silv', 'mec_gold', 'adviser'], desc: 'Звания пользователя' });
    },
};

/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Update numeric login to string. We have some old numeric logins, they fail on profile
 * viewing.
 */
module.exports = {
    async up(db) {
        await db.collection('users').updateMany({ login: { $type: 1 } }, [{ $set: { login: { $toString: '$login' } } }]);
    },

    async down() {
    // No rollback.
    },
};

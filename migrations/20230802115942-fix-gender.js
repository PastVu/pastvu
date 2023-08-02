/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Fix missing 'sex' user object property to users whose gender was matching
 * default one (it was not set in database, issue #611).
 */
module.exports = {
    async up(db/*, client*/) {
        await db.collection('users').updateMany({ 'sex': { $exists: false } }, { $set: { 'sex': 'm' } });
    },

    async down(/*db, client*/) {
    // Not required.
    },
};

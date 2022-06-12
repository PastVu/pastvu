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

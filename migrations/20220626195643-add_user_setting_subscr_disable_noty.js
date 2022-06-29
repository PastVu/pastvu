/**
 * Create new user setting subscr_disable_noty
 */
module.exports = {
    async up(db/*, client*/) {
        await db.collection('user_settings').insertOne({ key: 'subscr_disable_noty', val: false, vars: [true, false], desc: 'Присылать уведомления по электронной почте' });
    },

    async down(db/*, client*/) {
        await db.collection('user_settings').deleteOne({ key: 'subscr_disable_noty' });
    },
};


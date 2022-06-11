export default {
    region: {
        maxLevel: 5, // 6 levels of regions: 0..5
    },

    photo: {
        type: {
            PHOTO: 1,
            PAINTING: 2,
        },
        years: {
            1: { min: 1826, max: 2000 },
            2: { min: -100, max: 1980 },
        },

        status: {
            NEW: 0, // Newphoto
            REVISION: 1, // Being adjusted by user
            READY: 2, // Awaiting publication
            REVOKE: 3, // Revoked by owner
            REJECT: 4, // Rejected
            PUBLIC: 5, // Published
            DEACTIVATE: 7, // Deactivated
            REMOVE: 9, // Removed
        },

        historyFields: [
            's', 'geo', 'type',
            'file', 'type', 'format', 'sign', 'size', 'w', 'h', 'ws', 'hs',
            'title', 'desc', 'source', 'author', 'address', 'year', 'year2', 'y', 'dir',
            'watersignText',
            'nocomments',
        ],
        historyFieldsDiff: [
            'title', 'desc', 'source', 'author', 'address', 'y',
        ],
        parsingFields: [
            'desc', 'source', 'author',
        ],

        watersignLength: 65,
        watersignPattern: /[\w.,:;()[\]\\|/№§©®℗℠™•?!@#$%^&*+\-={}"'<>~` ]/g,
    },

    user: {
        ranks: [
            'mec', 'mec_silv', 'mec_gold', 'adviser',
        ],
    },
};

export default {
    NO_SUCH_METHOD: 'NO_SUCH_METHOD',
    UNHANDLED_ERROR: 'UNHANDLED_ERROR',

    region: {
        maxLevel: 5 // 6 levels of regions: 0..5
    },

    photo: {
        status: {
            NEW: 0, // Newphoto
            REVISION: 1, // Being adjusted by user
            READY: 2, // Awaiting publication
            REVOKE: 3, // Revoked by owner
            REJECT: 4, // Rejected
            PUBLIC: 5, // Published
            DEACTIVATE: 7, // Deactivated
            REMOVE: 9 // Removed
        },

        historyFields: [
            's', 'geo',
            'file', 'type', 'format', 'sign', 'size', 'w', 'h', 'ws', 'hs',
            'title', 'desc', 'source', 'author', 'address', 'year', 'year2', 'y', 'dir',
            'watersignText',
            'nocomments'
        ],
        historyFieldsDiff: [
            'title', 'desc', 'source', 'author', 'address', 'y'
        ],
        parsingFields: [
            'desc', 'source', 'author'
        ],

        watersignLength: 65,
        watersignPattern: /[\w\.,:;\(\)\[\]\\\|/№§©®℗℠™•\?!@#\$%\^&\*\+\-={}"'<>~` ]/g
    }
};
module.exports = {

    region: {
        maxLevel: 5 // 6 уровней регионов: 0..5
    },

    photo: {
        status: {
            NEW: 0, // Новое
            REVISION: 1, // На доработке
            READY: 2, // Ожидает публикации
            REVOKE: 3, // Отозвано владельцем
            REJECT: 4, // Отклонено
            PUBLIC: 5, // Опубликованное
            DEACTIVATE: 7, // Деактивировано
            REMOVE: 9 // Удалено
        },

        snaphotFields: [
            's', 'geo',
            'file', 'type', 'format', 'sign', 'size', 'w', 'h', 'ws', 'hs',
            'title', 'desc', 'source', 'author', 'address', 'year', 'year2', 'y', 'dir',
            'nocomments'
        ],
        snapshotFieldsDiff: [
            'title', 'desc', 'source', 'author', 'address', 'y'
        ]
    }
};

module.exports = {

    photo: {
        status: {
            NEW: 0, // Новое
            REVISION: 1, // На доработке
            READY: 2, // Ожидает публикации
            REVOKE: 3, // Отозвано владельцем
            REJECT: 4, // Отклонено
            PUBLIC: 5, // Опубликованное
            DEACTIVATED: 7, // Деактивировано
            REMOVED: 9 // Удалено
        },

        snaphotFields: [
            's', 'geo', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5',
            'file', 'type', 'format', 'sign', 'size', 'w', 'h', 'ws', 'hs',
            'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author', 'nocomments'
        ]
    }
};

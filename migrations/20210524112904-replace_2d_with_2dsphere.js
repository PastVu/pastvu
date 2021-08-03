/**
 * Replace 2d index with 2dsphere for support of geospacial queries on a
 * sphere.
 */
module.exports = {
    async up(db, client) {
        // Use transaction.
        const session = client.startSession();

        try {
            await session.withTransaction(async () => {
                // clusters
                await db.collection('clusters').createIndex({ g: '2dsphere', z: 1 });
                await db.collection('clusters').dropIndex({ g: '2d', z: 1 });

                // clusterspaint
                await db.collection('clusterspaint').createIndex({ g: '2dsphere', z: 1 });
                await db.collection('clusterspaint').dropIndex({ g: '2d', z: 1 });

                // photos
                await db.collection('photos').createIndex({ geo: '2dsphere' });
                await db.collection('photos').dropIndex({ geo: '2d' });

                await db.collection('photos').createIndex({ geo: '2dsphere', year: 1 });
                await db.collection('photos').dropIndex({ geo: '2d', year: 1 });

                // photos_map
                await db.collection('photos_map').createIndex({ geo: '2dsphere' });
                await db.collection('photos_map').dropIndex({ geo: '2d' });

                // paintings_map
                await db.collection('paintings_map').createIndex({ geo: '2dsphere' });
                await db.collection('paintings_map').dropIndex({ geo: '2d' });

                // regions
                await db.collection('regions').createIndex({ center: '2dsphere' });
                await db.collection('regions').dropIndex({ center: '2d' });

                // comments
                await db.collection('comments').createIndex({ geo: '2dsphere' });
                await db.collection('comments').dropIndex({ geo: '2d' });
            });
        } finally {
            await session.endSession();
        }
    },

    async down(db, client) {
        // Not really required, but just in case.
        const session = client.startSession();

        try {
            await session.withTransaction(async () => {
                // clusters
                await db.collection('clusters').createIndex({ g: '2d', z: 1 });
                await db.collection('clusters').dropIndex({ g: '2dsphere', z: 1 });

                // clusterspaint
                await db.collection('clusterspaint').createIndex({ g: '2d', z: 1 });
                await db.collection('clusterspaint').dropIndex({ g: '2dsphere', z: 1 });

                // photos
                await db.collection('photos').createIndex({ geo: '2d' });
                await db.collection('photos').dropIndex({ geo: '2dsphere' });

                await db.collection('photos').createIndex({ geo: '2d', year: 1 });
                await db.collection('photos').dropIndex({ geo: '2dsphere', year: 1 });

                // photos_map
                await db.collection('photos_map').createIndex({ geo: '2d' });
                await db.collection('photos_map').dropIndex({ geo: '2dsphere' });

                // paintings_map
                await db.collection('paintings_map').createIndex({ geo: '2d' });
                await db.collection('paintings_map').dropIndex({ geo: '2dsphere' });

                // regions
                await db.collection('regions').createIndex({ center: '2d' });
                await db.collection('regions').dropIndex({ center: '2dsphere' });

                // comments
                await db.collection('comments').createIndex({ geo: '2d' });
                await db.collection('comments').dropIndex({ geo: '2dsphere' });
            });
        } finally {
            await session.endSession();
        }
    },
};

/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Replace 2d index with 2dsphere for support of geospacial queries on a
 * sphere.
 */
module.exports = {
    async up(db/*, client*/) {
        // Fix clusters that have out of range latitude. There are few edge
        // cases that belong to north pole photos.
        await db.collection('clusters').updateMany({ 'g.1': { $gt: 89.999999 } }, { $set: { 'g.1': 89.999999 } });
        await db.collection('clusters').updateMany({ 'geo.1': { $gt: 89.999999 } }, { $set: { 'geo.1': 89.999999 } });

        // Creation of 2dsphere indexes according to model defintion and
        // deletion of redundant ones will be performed by syncAllIndexes call
        // on worker.
    },

    async down(db/*, client*/) {
        // Not really required, but if we go to the code state before 2dsphere
        // migration, syncAllIndexes won't be available at that point,
        // so revert all index changes.
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
    },
};

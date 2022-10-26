/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Region = null;
export let RegionStatQueue = null;

registerModel(db => {
    const imageStatSchema = {
        all: { type: Number, 'default': 0, index: true }, // Total
        geo: { type: Number, 'default': 0 }, // With geo only
        own: { type: Number, 'default': 0 }, // All without children regions
        owngeo: { type: Number, 'default': 0 }, // Without children regions with geo only

        // Number of photos for each image status
        s0: { type: Number, 'default': 0 },
        s1: { type: Number, 'default': 0 },
        s2: { type: Number, 'default': 0 }, // Awaiting moderation
        s3: { type: Number, 'default': 0 },
        s4: { type: Number, 'default': 0 },
        s5: { type: Number, 'default': 0 }, // Public
        s7: { type: Number, 'default': 0 },
        s9: { type: Number, 'default': 0 },
    };
    const commentsStatSchema = {
        all: { type: Number, 'default': 0, index: true }, // Total
        del: { type: Number, 'default': 0 }, // Deleted

        // Number of comments for each image status
        s5: { type: Number, 'default': 0 },
        s7: { type: Number, 'default': 0 },
        s9: { type: Number, 'default': 0 },
    };

    const RegionSchema = new Schema(
        {
            cid: { type: Number, index: { unique: true } },
            parents: [Number], // Parent regions (cids), if applicable
            geo: Schema.Types.Mixed,

            pointsnum: { type: Number, index: true }, // Number of points
            polynum: { type: Schema.Types.Mixed, 'default': {} }, // Number of polygons {exterior: N, interior: N}
            center: { type: [Number], index: '2dsphere' }, // Coordinates of region's center
            // Does region's center compute automatically(true) or setted manually(false)
            centerAuto: { type: Boolean, 'default': true, required: true },

            // Bounding box of region http://geojson.org/geojson-spec.html#bounding-boxes
            bbox: { type: [Number] },
            // Bounding box for determine zoom on user's map.
            // If it equals bbox - setted automatically, if not - manually
            bboxhome: { type: [Number] },

            cdate: { type: Date, 'default': Date.now, required: true, index: true }, // Creation stamp
            udate: { type: Date }, // Update stamp
            gdate: { type: Date }, // Update geo stamp

            cuser: { type: Schema.Types.ObjectId, ref: 'User' }, // User who created
            uuser: { type: Schema.Types.ObjectId, ref: 'User' }, // User who last updated
            guser: { type: Schema.Types.ObjectId, ref: 'User' }, // User who last updated geometry

            title_en: { type: String },
            title_local: { type: String },

            photostat: imageStatSchema, // Statistic for photos
            paintstat: imageStatSchema, // Statistic for paintings
            cstat: commentsStatSchema, // Statistic for comments
        },
        { strict: true }
    );

    RegionSchema.index({ geo: '2dsphere' });

    const RegionStatQueueSchema = new Schema(
        {
            cid: { type: Number, index: { unique: true } },
            stamp: { type: Date, 'default': Date.now, required: true, index: true }, // Creation time
            state: { type: Schema.Types.Mixed, 'default': {} }, // Object state on first state set
        },
        {
            collection: 'region_stat_queue',
            strict: true,
        }
    );

    Region = db.model('Region', RegionSchema);
    RegionStatQueue = db.model('RegionStatQueue', RegionStatQueueSchema);
});

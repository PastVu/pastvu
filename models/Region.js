import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Region = null;

registerModel(db => {
    const RegionSchema = new Schema(
        {
            cid: { type: Number, index: { unique: true } },
            parents: [Number], // Parent regions (cids), if applicable
            geo: Schema.Types.Mixed,

            pointsnum: { type: Number, index: true }, // Number of points
            polynum: { type: Schema.Types.Mixed, 'default': {} }, // Number of polygons {exterior: N, interior: N}
            center: { type: [Number], index: '2d' }, // Coordinates of region's center
            // Does region's center compute automatically(true) or setted manually(false)
            centerAuto: { type: Boolean, 'default': true, required: true },

            // Bounding box of region http://geojson.org/geojson-spec.html#bounding-boxes
            bbox: { type: [Number] },
            // Bounding box for determine zoom on user's map.
            // If it equals bbox - setted automatically, if not - manually
            bboxhome: { type: [Number] },

            cdate: { type: Date, 'default': Date.now, required: true, index: true }, // Creation stamp
            udate: { type: Date, 'default': Date.now, required: true }, // Update stamp

            title_en: { type: String },
            title_local: { type: String }
        },
        { strict: true }
    );

    RegionSchema.index({ geo: '2dsphere' });

    Region = db.model('Region', RegionSchema);
});
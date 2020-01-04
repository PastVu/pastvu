import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let ActionLog = null;

registerModel(db => {
    // Model for logging users actvions
    const ActionLogSchema = new Schema(
        {
            user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Action subject
            stamp: { type: Date, 'default': Date.now, required: true }, // Action timestamp

            obj: { type: Schema.Types.ObjectId, required: true, index: true }, // Action object
            objtype: { type: Number, required: true, index: true }, // Object type. 1 - user, 2 - phoot, 3 - comment

            type: { type: Number, required: true }, // Action type. 1 - create, 8 - restore, 9 - remove

            reason: {
                key: { type: Number }, // Key of reason from reference
                desc: { type: String }, // Manual description
            },
            role: { type: Number }, // Role of subject at action time, if it was used to perform action
            roleregion: { type: Number }, // Region of role

            addinfo: { type: Schema.Types.Mixed }, // Additional info, it structure depends on action and object types
        },
        {
            strict: true,
            collection: 'actionlog',
        }
    );

    ActionLogSchema.index({ user: 1, stamp: -1 });
    ActionLogSchema.index({ obj: 1, stamp: -1 });

    ActionLog = db.model('ActionLog', ActionLogSchema);
});

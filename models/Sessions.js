import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Session = null;
export let SessionArchive = null;

registerModel(db => {
    Session = db.model('Session', new Schema(
        {
            key: { type: String, index: { unique: true } }, // Session key
            previous: { type: String }, // Key of previous session
            created: { type: Date, 'default': Date.now }, // Creation time
            stamp: { type: Date, 'default': Date.now }, // Time of last session activity
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // _id of registered user
            anonym: require('./User').AnonymScheme, // Object of anonym user, which is saved directly to session
            data: { type: Schema.Types.Mixed, 'default': {} }, // Session date
        },
        { collection: 'sessions', strict: true }
    ));
    SessionArchive = db.model('SessionArchive', new Schema(
        {
            key: { type: String, index: { unique: true } }, // Session key
            previous: { type: String }, // Key of previous session
            created: { type: Date, 'default': Date.now }, // Creation time
            stamp: { type: Date, 'default': Date.now }, // Time of last session activity
            archived: { type: Date, 'default': Date.now }, // Time of archivation
            archive_reason: { type: String }, // Reason for archiving: login | logout | destroy | expire
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // _id of registered user
            anonym: require('./User').AnonymScheme, // Object of anonym user, which is saved directly to session
            data: { type: Schema.Types.Mixed, 'default': {} }, // Session date
        },
        { collection: 'sessions_archive', strict: true }
    ));
});

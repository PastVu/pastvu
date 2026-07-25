/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let UserNoty = null;
export let UserObjectRel = null;
export let UserSelfPublishedPhotos = null;

registerModel(db => {
    // Scheme of relationship user-object (photo or news)
    const UserObjectRelSchema = new Schema(
        {
            obj: { type: Schema.Types.ObjectId, index: true }, // Object _id
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // User _id
            type: { type: String }, // Object type

            view: { type: Date }, // Time of last view of object
            comments: { type: Date }, // Time of last view of object's comments
            ccount_new: { type: Number }, // Number of new comments
            sbscr_create: { type: Date }, // Time of subscription create
            sbscr_noty_change: { type: Date }, // Change time of sbscr_noty
            sbscr_noty: { type: Boolean }, // Flag that notification send needed
        },
        { strict: true, collection: 'users_objects_rel' }
    );

    // Compound index for request by user and object
    UserObjectRelSchema.index({ obj: 1, user: 1 });
    // Compound index for request user subscriptions
    UserObjectRelSchema.index({ user: 1, ccount_new: -1, sbscr_create: -1 });

    // Sending time of user notification
    const UserNotySchema = new Schema(
        {
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
            lastnoty: { type: Date }, // Previous send
            nextnoty: { type: Date, index: true }, // Next send. Indexed for sort
        },
        { strict: true, collection: 'users_noty' }
    );

    // List of selfpublished photos (without moderation)
    const UserSelfPublishedPhotosSchema = new Schema(
        {
            user: { type: Schema.Types.ObjectId, ref: 'User', index: { unique: true } },
            photos: [Schema.Types.ObjectId], // Array of photo that user selfpublished
        },
        { strict: true, collection: 'users_selfpublished_photos' }
    );

    UserNoty = db.model('UserNoty', UserNotySchema);
    UserObjectRel = db.model('UserObjectRel', UserObjectRelSchema);
    UserSelfPublishedPhotos = db.model('UserSelfPublishedPhotos', UserSelfPublishedPhotosSchema);
});

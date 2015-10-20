import { Schema } from 'mongoose';
import constants from '../controllers/constants';
import { registerModel } from '../controllers/connection';

export let Comment = null;
export let CommentN = null;

const delInfo = {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    stamp: { type: Date },
    reason: {
        cid: { type: Number }, // Номер причины удаления из справочника
        desc: { type: String } // Ручное описание причины удаления. Как основное, так и дополнительное в случае cid
    },
    origin: { type: Number }, // Если у удаляемого комментария есть дочерние, проставляем им ссылку (cid) непосредственно удаляемого, в этом случае reason дочерним можно не указывать
    role: { type: Number }, // Реализуемая на момент удаления роль пользователя. Например, если это модератор. При удалении своего комментария без потомков не заполняется
    roleregion: { type: Number } // Регион реализуемой роли
};
const histSchema = {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    stamp: { type: Date, 'default': Date.now, required: true },
    frag: { type: Number },
    txt: { type: String },
    txtd: { type: String }, // Текст с подсветкой разницы
    del: { // Некоторые поля удаления из delInfo (остальные непосредственно в histSchema)
        reason: {
            cid: { type: Number },
            desc: { type: String }
        },
        origin: { type: Number }
    },
    restore: { type: Boolean }, // Восстановлен
    role: { type: Number }, // Реализуемая на момент операции роль пользователя. Например, если это модератор
    roleregion: { type: Number } // Регион реализуемой роли
};
// Photos comments
const CommentPSchema = new Schema(
    {
        cid: { type: Number, index: { unique: true } },
        obj: { type: Schema.Types.ObjectId, ref: 'Photo', index: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        stamp: { type: Date, 'default': Date.now, required: true, index: true },
        txt: { type: String },
        parent: { type: Number },
        level: { type: Number },
        frag: { type: Boolean },

        geo: { type: [Number], index: '2d' }, // Координаты [lng, lat] фотографии, которой принадлежит комментарий

        // Photo's status (listed in constants)
        s: { type: Number, index: true, 'default': constants.photo.status.PUBLIC, required: true },

        // Принадлежность к регионам, так же как в модели фотографий
        // необходимо, чтобы можно было фильтровать комментарии по регионам без запросов фотографйи
        r0: { type: Number, sparse: true },
        r1: { type: Number, sparse: true },
        r2: { type: Number, sparse: true },
        r3: { type: Number, sparse: true },
        r4: { type: Number, sparse: true },
        r5: { type: Number, sparse: true },

        lastChanged: { type: Date }, // Time of last changes
        hist: [new Schema(histSchema)],

        del: delInfo, // Comment is deleted

        // Hidden comment, for example, it belongs to inactive photo.
        // It doesn't shown in user comments list and doesn't not involved in statistics
        hidden: { type: Boolean } // true if status not PUBLIC
    },
    {
        strict: true
    }
);

// News comments
const CommentNSchema = new Schema(
    {
        cid: { type: Number, index: { unique: true } },
        obj: { type: Schema.Types.ObjectId, ref: 'News', index: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        stamp: { type: Date, 'default': Date.now, required: true, index: true },
        txt: { type: String },
        parent: { type: Number },
        level: { type: Number },

        lastChanged: { type: Date }, // Time of last changes
        hist: [new Schema(histSchema)],

        del: delInfo // Comment is deleted
    },
    { strict: true, collection: 'commentsn' }
);

CommentPSchema.index({ user: 1, stamp: -1 }); // Compund index for select user comments
// CommentSchema.index({ photo: 1, stamp: 1 }); // Compund index for select photo comments (Not needed yet)

registerModel(db => {
    Comment = db.model('Comment', CommentPSchema);
    CommentN = db.model('CommentN', CommentNSchema);
});
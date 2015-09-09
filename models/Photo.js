var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var FragmentSchema = new Schema({
    cid: { type: Number }, // Comment cid

    l: { type: Number }, // Left percent
    t: { type: Number }, // Top percent
    w: { type: Number }, // Width percent
    h: { type: Number },  // Height percent

    del: { type: Boolean } // Flag that fragment's comment has been deleted
});

var PhotoSchema = new Schema({
    cid: { type: Number, index: { unique: true } },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    s: { type: Number, index: true }, // Photo's status (listed in constants)
    stdate: { type: Date }, // Time of setting current photo status

    // Load time
    ldate: { type: Date, 'default': Date.now, required: true, index: true },
    // Activation time
    adate: { type: Date, sparse: true },
    // Time fo sort (for example, new photo must be always at top of user gallery)
    sdate: { type: Date, 'default': Date.now, required: true, index: true },
    // Last change time
    cdate: { type: Date },
    // Time of last change, which used for notifying user about change
    // cdate - shows change time of many attributes (including status), whereas ucdate tracks only human-readable attributes
    ucdate: { type: Date },

    // Coordinates, [lng, lat]
    geo: { type: [Number], index: '2d' },

    // Нельзя сделать array вхождений в регионы, так как индекс по массивам не эффективен
    // http://docs.mongodb.org/manual/faq/indexes/#can-i-use-a-multi-key-index-to-support-a-query-for-a-whole-array
    // Поэтому делаем избыточные поля на каждый уровень региона, со sparse индексом
    r0: { type: Number, sparse: true },
    r1: { type: Number, sparse: true },
    r2: { type: Number, sparse: true },
    r3: { type: Number, sparse: true },
    r4: { type: Number, sparse: true },
    r5: { type: Number, sparse: true },

    // Имя файла c путем, например 'i/n/o/ino6k6k6yz.jpg'
    file: { type: String, required: true },

    type: { type: String }, // like 'image/jpeg'
    format: { type: String }, // like 'JPEG'
    sign: { type: String }, // Signature of original image
    signs: { type: String }, // Signature of converted standart size image
    size: { type: Number },
    w: { type: Number }, // Original width
    h: { type: Number }, // Original height
    ws: { type: Number }, // Standard width
    hs: { type: Number }, // Standard height
    waterh: { type: Number }, // Original size watermark height
    waterhs: { type: Number }, // Standard size watermark height

    watersignIndividual: { type: Boolean }, // Set individual watermark (not from user profile settings)
    watersignOption: { type: Schema.Types.Mixed }, // Watermark individual option, appended to photo
    watersignCustom: { type: String }, // Individual user text on watermark (except photo url)
    watersignText: { type: String }, // Current sign on watermark, appended in the moment of last convert

    dir: { type: String },
    title: { type: String },
    year: { type: Number },
    year2: { type: Number },
    y: { type: String },
    address: { type: String },
    desc: { type: String },
    source: { type: String },
    author: { type: String },

    conv: { type: Boolean }, // Converting now
    convqueue: { type: Boolean }, // In the queue for conversion

    vdcount: { type: Number, index: true }, // Views per day
    vwcount: { type: Number, index: true }, // Views per week
    vcount: { type: Number, index: true }, // Total views
    ccount: { type: Number, index: true }, // Number of comments
    frags: [FragmentSchema], // Array of comment's fragments

    nocomments: { type: Boolean }, // Prohibit commentation
    nowaterchange: { type: Boolean } // Prohibit watersign changing
});

// В основной коллекции фотографий индексируем выборку координат по годам для выборки на карте
// Compound index http://docs.mongodb.org/manual/core/geospatial-indexes/#compound-geospatial-indexes
PhotoSchema.index({ g: '2d', year: 1 });
PhotoSchema.index({ r0: 1, sdate: 1 });
PhotoSchema.index({ r1: 1, sdate: 1 });
PhotoSchema.index({ r2: 1, sdate: 1 });
PhotoSchema.index({ r3: 1, sdate: 1 });
PhotoSchema.index({ r4: 1, sdate: 1 });
PhotoSchema.index({ r5: 1, sdate: 1 });

var PhotoHistSchema = new Schema(
    {
        cid: { type: Number, index: true },
        stamp: { type: Date, 'default': Date.now, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: Number }, // Реализуемая на момент операции роль пользователя. Например, если это модератор
        roleregion: { type: Number }, // Регион реализуемой роли
        reason: {
            cid: { type: Number },
            desc: { type: String }
        },
        values: { type: Schema.Types.Mixed },  // Значения полей, установленные в этот stamp
        add: { type: [String] }, // Список добавившихся полей
        del: { type: [String] }, // Список удаленных полей
        diff: { type: Schema.Types.Mixed } // Diff для некоторых полей, изменившихся в этой записи
    },
    { collection: 'photos_history', strict: true, versionKey: false }
);
var PhotoMapSchema = new Schema(
    {
        cid: { type: Number, index: { unique: true } },
        geo: { type: [Number], index: '2d' },
        file: { type: String, required: true },
        dir: { type: String },
        title: { type: String, 'default': '' },
        year: { type: Number, 'default': 2000 },
        year2: { type: Number, 'default': 2000 }
    },
    { collection: 'photos_map', strict: true }
);

var PhotoConveyerSchema = new Schema(
    {
        cid: { type: Number, index: true },
        priority: { type: Number, required: true },
        added: { type: Date, 'default': Date.now, required: true },
        converting: { type: Boolean },
        watersign: { type: Schema.Types.Mixed } // Additional text on watermark
    },
    {
        collection: 'photos_conveyer',
        strict: true
    }
);
PhotoConveyerSchema.index({ priority: 1, added: 1 });

// Ошибки конвертирования
var PhotoConveyerErrorSchema = new Schema(
    {
        cid: { type: String, index: true },
        added: { type: Date },
        stamp: { type: Date, 'default': Date.now },
        error: { type: String }
    },
    {
        collection: 'photos_conveyer_errors',
        strict: true
    }
);

//Статистика заполненности конвейера
var STPhotoConveyerSchema = new Schema(
    {
        stamp: { type: Date, 'default': Date.now, required: true, index: true },
        clength: { type: Number }, // Максимальная длина конвейра на дату
        converted: { type: Number } // Обработанно фотографий на дату
    },
    {
        strict: true
    }
);

PhotoSchema.pre('save', function (next) {
    if (this.isModified('year') || this.isModified('year2')) {
        // Fill aggregated year field. '—' here is em (long) dash '&mdash;' (not hyphen or minus)
        if (this.year && this.year2) {
            this.y = this.year === this.year2 ? String(this.year) : this.year + '—' + this.year2;
        } else {
            this.y = undefined;
        }
    }

    return next();
});

module.exports.makeModel = function (db) {
    db.model('Photo', PhotoSchema);
    db.model('PhotoMap', PhotoMapSchema);
    db.model('PhotoHistory', PhotoHistSchema);

    db.model('PhotoConveyer', PhotoConveyerSchema);
    db.model('PhotoConveyerError', PhotoConveyerErrorSchema);
    db.model('STPhotoConveyer', STPhotoConveyerSchema);
};
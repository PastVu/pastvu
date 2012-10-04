var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var Photo = new mongoose.Schema({
    nid: {type: Number, index: { unique: true }},
    user_id: {type: ObjectId, index: { unique: true }},
    album_id: {type: Number},
    stack_id: {type: String},
    stack_order: {type: Number},

    lat: {type: String},
    lng: {type: String},
    direction: {type: String},

    file: {type: String},
    loaded: {type: Date, default: Date.now},
    width: {type: Number},
    height: {type: Number},

    title: {type: String},
    year: {type: String},
    year_from: {type: Number},
    year_to: {type: Number},
    address: {type: String},
    description: {type: String},
    source: {type: String},
    author: {type: String},

    stats_day: {type: Number},
    stats_week: {type: Number},
    stats_all: {type: Number},
    comments_count: {type: Number},

    checked: {type: Boolean}
});

var PhotoModel = mongoose.model('Photo', Photo);

/*var anonymous = new UserModel();
 anonymous.login = 'neo';
 anonymous.pass = 'energy';
 anonymous.hashPassword();
 anonymous.city = 'NY';
 anonymous.comment = 'good role';
 anonymous.save(function (err) {
 console.log('USER '+err);
 });*/
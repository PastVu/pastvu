const mongoose = require('mongoose');

mongoose.Query.prototype.paginate = function paginate(page, limit, cb) {
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;

    let query = this;
    const model = this.model;
    const skipFrom = page * limit - limit;

    query = query.skip(skipFrom).limit(limit);

    if (cb) {
        query.exec((err, docs) => {
            if (err) {
                cb(err, null, null);
            } else {
                // eslint-disable-next-line no-underscore-dangle
                model.countDocuments(query._conditions, (err, total) => {
                    if (err) {
                        cb(err, null, null);
                    } else {
                        cb(null, docs, total);
                    }
                });
            }
        });
    } else {
        return this;
    }
};

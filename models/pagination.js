/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const mongoose = require('mongoose');

mongoose.Query.prototype.paginate = async function paginate(page, limit) {
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;

    const model = this.model;
    const skipFrom = page * limit - limit;
    const query = this.skip(skipFrom).limit(limit);

    const docs = await query.exec();
    // eslint-disable-next-line no-underscore-dangle
    const total = await model.countDocuments(query._conditions).exec();

    return { docs, total };
};

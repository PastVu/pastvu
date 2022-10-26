/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import { waitDb } from './connection';
import { Reason } from '../models/Reason';
import { UserAction } from '../models/UserAction';
import { BadParamsError } from '../app/errors';

let reasonsHash = {};

export const ready = waitDb.then(() => populateReasonsHash());

/**
 * Populate reasons hash from database.
 *
 * TODO: No clear reason why this need to be stored in database, consider
 * moving reasons list to constants.
 */
async function populateReasonsHash() {
    const rsns = await Reason.find({}, { _id: 0 }, { lean: true }).exec();

    if (_.isEmpty(rsns)) {
        reasonsHash = {};
    } else {
        reasonsHash = rsns.reduce((result, reason) => {
            result[reason.cid] = reason;

            return result;
        }, {});
    }
}

/**
 * @param {number[]} cids Array of cids of reasons
 */
export const getReasonHashFromCache = cids => _.transform(cids, (result, cid) => {
    const reason = reasonsHash[cid];

    if (reason !== undefined) {
        result[reason.cid] = reason;
    }
}, {});

async function giveActionReasons({ action: key }) {
    if (!_.isString(key) || !key.length) {
        throw new BadParamsError();
    }

    const action = await UserAction.findOne({ key }, { _id: 0, reasons: 1, reason_text: 1 }, { lean: true }).exec();

    if (_.isEmpty(_.get(action, 'reasons'))) {
        return;
    }

    const reasons = action.reasons.map(cid => reasonsHash[cid]);

    return { reasons, reason_text: action.reason_text };
}

export const giveReasonTitle = function ({ cid }) {
    return _.get(reasonsHash, `[${cid}].title`);
};

giveActionReasons.isPublic = true;

export default {
    giveActionReasons,
};

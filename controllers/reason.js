import ms from 'ms';
import _ from 'lodash';
import { waitDb } from './connection';
import { Reason } from '../models/Reason';
import { UserAction } from '../models/UserAction';
import { BadParamsError } from '../app/errors';

let reasonsHash = {};

// Periodically select all reasons from db and store them in memory
async function periodicFetchReasons() {
    const rsns = await Reason.find({}, { _id: 0 }, { lean: true }).exec();

    if (_.isEmpty(rsns)) {
        reasonsHash = {};
    } else {
        reasonsHash = rsns.reduce((result, reason) => {
            result[reason.cid] = reason;

            return result;
        }, {});
    }

    setTimeout(periodicFetchReasons, ms('30s'));

    return rsns;
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

// After connection to db read reasons
waitDb.then(periodicFetchReasons);

giveActionReasons.isPublic = true;

export default {
    giveActionReasons,
};

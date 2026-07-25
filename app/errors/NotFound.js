/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

export default class NotFoundError extends ApplicationError {
    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.NO_SUCH_RESOURCE,
            statusCode: 404,
            trace: false,
        });

        super(data, rid);
    }
}

NotFoundError.prototype.name = 'NotFoundError';

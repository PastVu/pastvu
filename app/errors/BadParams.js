/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

export default class BadParamsError extends ApplicationError {
    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.BAD_PARAMS,
            statusCode: 400,
        });

        super(data, rid);
    }
}

BadParamsError.prototype.name = 'BadParamsError';

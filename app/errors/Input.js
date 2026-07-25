/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Input error
 * Raised on user inputs, for example, required fields
 * By default stack will not be printed (trace: false)
 */
export default class InputError extends ApplicationError {
    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.INPUT,
            statusCode: 400,
            trace: false,
        });

        super(data, rid);
    }
}

InputError.prototype.name = 'InputError';

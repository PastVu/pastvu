/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Authorization error, raise when user has no access rights to resources
 * Params: timeout number(ms) or object with timeout number property and additional data (can override code, message)
 */
export default class AuthorizationError extends ApplicationError {
    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.DENY,
            statusCode: 403,
        });

        super(data, rid);
    }
}

AuthorizationError.prototype.name = 'AuthorizationError';

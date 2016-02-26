import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Authentication error
 * Responsible for login, registration, password forms
 */
export default class AuthenticationError extends ApplicationError {

    constructor(data = {}) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.AUTHENTICATION
        });

        super(data);
    }

}

AuthenticationError.prototype.name = 'AuthenticationError';
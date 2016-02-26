import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Input error
 * Raised on user inputs, for example, required fields
 */
export default class InputError extends ApplicationError {

    constructor(data = {}) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.INPUT
        });

        super(data);
    }

}

InputError.prototype.name = 'InputError';
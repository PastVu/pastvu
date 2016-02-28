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
            trace: false
        });

        super(data, rid);
    }

}

InputError.prototype.name = 'InputError';
import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

export default class BadParamsError extends ApplicationError {

    constructor(data, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.BAD_PARAMS
        });

        super(data, rid);
    }

}

BadParamsError.prototype.name = 'BadParamsError';

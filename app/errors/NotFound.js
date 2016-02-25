import constants from './constants';
import ApplicationError from './Application';

export default class NotFoundError extends ApplicationError {

    constructor(data = {}) {
        if (!data.code) {
            data.code = constants.NO_SUCH_RESOURCE;
        }

        super(data);
    }

}

NotFoundError.prototype.name = 'NotFoundError';

import ApplicationError from './Application';

export default class ParamsValidationError extends ApplicationError {

    constructor(data) {
        super(data);
    }

}

ParamsValidationError.prototype.name = 'ParamsValidationError';

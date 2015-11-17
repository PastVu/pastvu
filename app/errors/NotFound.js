import ApplicationError from './Application';

export class NotFound extends ApplicationError {

    constructor() {
        super();
    }

}

NotFound.prototype.name = 'NotFound';

import ApplicationError from './Application';

export default class NotFound extends ApplicationError {

    constructor() {
        super();
    }

}

NotFound.prototype.name = 'NotFound';

import ms from 'ms';
import ApplicationError from './Application';

export default class TimeoutError extends ApplicationError {

    constructor(event, timeout) {
        super();
        this.event = event;
        this.timeout = timeout;
    }

    toString() {
        let message = `Timeout: ${JSON.stringify(this.event)}`;

        if (this.timeout) {
            message += ` (${ms(this.timeout, { long: true })} passed)`;
        }

        return message;
    }

}

TimeoutError.prototype.name = 'TimeoutError';
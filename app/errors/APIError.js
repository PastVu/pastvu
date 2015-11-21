import _ from 'lodash';
import ApplicationError from './Application';

export default class APIError extends ApplicationError {
    // constructor is optional; you should omit it if you just want a custom error
    // type for inheritance and type checking
    constructor(code, message, details = {}) {
        super(message);

        this.code = code;
        this.details = details;
    }

    toJSON() {
        return {
            code: this.code,
            details: this.details,
            message: this.message
        };
    }

    setInvalidParam(invalidParam) {
        this.details.invalidParam = invalidParam;

        return this.details.invalidParam;
    }

    setErrorMessage(errorMessages) {
        const errorMessageForCode = errorMessages[this.code];
        let errorMessage;

        if (typeof errorMessageForCode === 'string') {
            errorMessage = errorMessageForCode;
        } else if (_.isPlainObject(errorMessageForCode)) {
            // Determines if an invalid parameter specified.
            errorMessage = errorMessageForCode[this.details.invalidParam] || errorMessageForCode.default;
        }

        this.message = errorMessage || errorMessages.unknown;

        return this.message;
    }
}

APIError.prototype.name = 'APIError';
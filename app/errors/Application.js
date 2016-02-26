import _ from 'lodash';
import errorMsgs from './intl';

const CAPTURE_STACK_TRACE_SUPPORT = Boolean(Error.captureStackTrace);
const FIREFOX_ERROR_INFO = /@(.+?):(\d+):(\d+)$/;

/**
 * PastVu main error type
 */
export default class ApplicationError extends Error {

    constructor(data = {}) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        const { code, message, logged, trace, ...details } = data;

        super(message || errorMsgs[code] || code); // Native Error contructor accepts message

        this.code = code;
        this.trace = trace;
        this.logged = logged;
        this.details = details;

        // Ensure we get a proper stack trace in most Javascript environments
        if (CAPTURE_STACK_TRACE_SUPPORT) {
            // V8 environments (Chrome and Node.js)
            Error.captureStackTrace(this, this.constructor);
        } else {
            // Firefox workaround
            let { stack } = new Error;

            if (stack) {
                // Skipping first line in stack (it's the line where we have create our `new Error`)
                stack = stack.split('\n').slice(1);
                // Trying to get file name, line number and column number from the first line in stack
                const [, fileName, lineNumber, columnNumber] = FIREFOX_ERROR_INFO.exec(stack[0] || '') || [];

                this.stack = stack.join('\n');
                this.fileName = fileName ? fileName : undefined;
                this.lineNumber = lineNumber ? Number(lineNumber) : undefined;
                this.columnNumber = columnNumber ? Number(columnNumber) : undefined;
            }
        }
    }

    toJSON() {
        const result = {
            type: this.name,
            code: this.code,
            message: this.message
        };

        if (!_.isEmpty(this.details)) {
            result.details = this.details;
        }

        return result;
    }

    // Set flag, that error was logged. For example, if we logged it in webapi call and throw further in express routes
    setLogged() {
        this.logged = true;
    }

}

// Needed if we want to take name from error instance.
// For example as this.name, when we override toString method
ApplicationError.prototype.name = 'ApplicationError';
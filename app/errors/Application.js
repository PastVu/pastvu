const CAPTURE_STACK_TRACE_SUPPORT = Boolean(Error.captureStackTrace);
const FIREFOX_ERROR_INFO = /@(.+?):(\d+):(\d+)$/;

export default class ApplicationError extends Error {
    constructor(message) {
        super(message); // TODO: Make ...arguments in Node 5

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
}

ApplicationError.prototype.name = 'ApplicationError';
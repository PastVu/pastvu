/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Utils'], function (Utils) {
    const CAPTURE_STACK_TRACE_SUPPORT = Boolean(Error.captureStackTrace);
    const FIREFOX_ERROR_INFO = /@(.+?):(\d+):(\d+)$/;

    const ApplicationError = function () {
        Error.apply(this, arguments);

        // Ensure we get a proper stack trace in most Javascript environments
        if (CAPTURE_STACK_TRACE_SUPPORT) {
            // V8 environments (Chrome and Node.js)
            Error.captureStackTrace(this, this.constructor);
        } else {
            // Firefox workaround
            let stack = new Error().stack;

            if (stack) {
                // Skipping first line in stack (it's the line where we have create our `new Error`)
                stack = stack.split('\n').slice(1);

                // Trying to get file name, line number and column number from the first line in stack
                const match = FIREFOX_ERROR_INFO.exec(stack[0] || '');

                this.stack = stack.join('\n');
                this.fileName = match ? match[1] : undefined;
                this.lineNumber = match ? +match[2] : undefined;
                this.columnNumber = match ? +match[3] : undefined;
            }
        }
    };

    Utils.inherit(ApplicationError, Error);

    ApplicationError.prototype.name = 'ApplicationError';

    return ApplicationError;
});

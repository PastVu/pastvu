/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import http from 'http';
import { t as translate } from '../../commons/i18n';
import errorMsgs from './intl';
import constants from './constants';

const CAPTURE_STACK_TRACE_SUPPORT = Boolean(Error.captureStackTrace);
const FIREFOX_ERROR_INFO = /@(.+?):(\d+):(\d+)$/;

/**
 * PastVu main error type
 */
export default class ApplicationError extends Error {
    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        const {
            code = constants.UNHANDLED_ERROR, statusCode = 500,
            logged = false, trace = true,
            message, ...details
        } = data;

        super(message || errorMsgs[code] || code); // Native Error contructor accepts message

        this.rid = rid;
        this.code = code;
        this.trace = trace;
        this.logged = logged;
        this.details = details;
        // Distinguishes an explicit message (verbatim, never translated) from
        // the fall-back lookup against errorMsgs[code] which toJSON(lang) can
        // re-translate.
        this.hasExplicitMessage = Boolean(message);
        this.statusCode = statusCode;
        this.statusText = http.STATUS_CODES[statusCode];

        // Ensure we get a proper stack trace in most Javascript environments
        if (CAPTURE_STACK_TRACE_SUPPORT) {
            // V8 environments (Chrome and Node.js)
            Error.captureStackTrace(this, this.constructor);
        } else {
            // Firefox workaround
            let { stack } = new Error();

            if (stack) {
                // Skipping first line in stack (it's the line where we have create our `new Error`)
                stack = stack.split('\n').slice(1);

                // Trying to get file name, line number and column number from the first line in stack
                const [, fileName, lineNumber, columnNumber] = FIREFOX_ERROR_INFO.exec(stack[0] || '') || [];

                this.stack = stack.join('\n');
                this.fileName = fileName || undefined;
                this.lineNumber = lineNumber ? Number(lineNumber) : undefined;
                this.columnNumber = columnNumber ? Number(columnNumber) : undefined;
            }
        }
    }

    // Pick the message to ship to the client. Explicit messages (constructed
    // with { message: '…' }) flow through verbatim; for code-only errors we
    // re-resolve the Russian source from errorMsgs[code] through i18next so
    // the receiver sees it in their language. `undefined` lang means the
    // caller doesn't want translation; an empty string still hits resolveLang.
    localizedMessage(lang) {
        if (this.hasExplicitMessage || lang === undefined) {
            return this.message;
        }

        const russianSource = errorMsgs[this.code] || this.code;

        return translate(lang, russianSource);
    }

    toJSON(lang) {
        const result = {
            type: this.name,
            code: this.code,
            message: this.localizedMessage(lang),
        };

        if (!_.isEmpty(this.rid)) {
            result.rid = this.rid;
        }

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

/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import Utils from 'Utils';
import ApplicationError from 'errors/Application';

function TimeoutError(event, timeout) {
    TimeoutError.superproto.constructor.call(this);

    this.event = event;
    this.timeout = timeout;
}

Utils.inherit(TimeoutError, ApplicationError);

TimeoutError.prototype.name = 'TimeoutError';
TimeoutError.prototype.toString = function () {
    let message = 'Timeout: ' + JSON.stringify(this.event);

    if (this.timeout) {
        message += ' (' + this.timeout / 1000 + 's passed)';
    }

    return message;
};

export default TimeoutError;

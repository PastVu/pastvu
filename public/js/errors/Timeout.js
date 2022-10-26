/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Utils', 'errors/Application'], function (Utils, ApplicationError) {
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

    return TimeoutError;
});

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

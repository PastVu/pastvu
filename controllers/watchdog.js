/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Detects silent death of components that are expected to show regular
 * activity (e.g. BullMQ workers and queue event listeners, whose blocking
 * Redis connections can die without emitting any error). Callers report
 * activity with beat() and long-running busy periods with markBusy()/
 * markIdle(); if there is neither activity nor busyness for longer than the
 * timeout, onSilence is invoked.
 */
export class SilenceWatchdog {
    /**
     * @param {object} opts
     * @param {string} opts.name Identifier used by the caller for logging.
     * @param {number} opts.timeout Silence duration in ms that triggers onSilence.
     * @param {Function} opts.onSilence Called with the silence duration in ms.
     * @param {number} [opts.checkInterval] How often to check, defaults to timeout/4.
     */
    constructor({ name, timeout, onSilence, checkInterval }) {
        this.name = name;
        this.timeout = timeout;
        this.onSilence = onSilence;
        this.checkInterval = checkInterval || Math.ceil(timeout / 4);
        this.busyCount = 0;
        this.timer = null;
    }

    start() {
        if (this.timer) {
            return;
        }

        this.lastBeat = Date.now();
        this.timer = setInterval(() => this.check(), this.checkInterval);

        // Don't keep the process alive just for the watchdog.
        if (typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    beat() {
        this.lastBeat = Date.now();
    }

    markBusy() {
        this.busyCount++;
    }

    markIdle() {
        this.busyCount = Math.max(0, this.busyCount - 1);
        this.beat();
    }

    check() {
        // A component with work in progress is alive even if silent.
        if (this.busyCount > 0) {
            this.beat();

            return;
        }

        const silentFor = Date.now() - this.lastBeat;

        if (silentFor >= this.timeout) {
            // Reset so onSilence fires once per full silence period, not on
            // every subsequent check.
            this.beat();
            this.onSilence(silentFor);
        }
    }
}

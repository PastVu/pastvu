/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { SilenceWatchdog } from '../watchdog.js';

describe('silence watchdog', () => {
    let onSilence;

    beforeEach(() => {
        jest.useFakeTimers();
        onSilence = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const createWatchdog = (timeout = 60000) => new SilenceWatchdog({ name: 'test', timeout, onSilence });

    it('does not fire before timeout elapses', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        jest.advanceTimersByTime(59000);

        expect(onSilence).not.toHaveBeenCalled();

        watchdog.stop();
    });

    it('fires once timeout of silence elapses', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        jest.advanceTimersByTime(61000);

        expect(onSilence).toHaveBeenCalledTimes(1);
        expect(onSilence).toHaveBeenCalledWith(expect.any(Number));
        expect(onSilence.mock.calls[0][0]).toBeGreaterThanOrEqual(60000);

        watchdog.stop();
    });

    it('beat defers firing', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        jest.advanceTimersByTime(45000);
        watchdog.beat();
        jest.advanceTimersByTime(45000);

        expect(onSilence).not.toHaveBeenCalled();

        jest.advanceTimersByTime(20000);

        expect(onSilence).toHaveBeenCalledTimes(1);

        watchdog.stop();
    });

    it('does not fire while marked busy', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        watchdog.markBusy();
        jest.advanceTimersByTime(300000);

        expect(onSilence).not.toHaveBeenCalled();

        watchdog.stop();
    });

    it('fires after markIdle followed by silence', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        watchdog.markBusy();
        jest.advanceTimersByTime(300000);
        watchdog.markIdle();
        jest.advanceTimersByTime(61000);

        expect(onSilence).toHaveBeenCalledTimes(1);

        watchdog.stop();
    });

    it('stays quiet while any of overlapping busy markers remains', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        watchdog.markBusy();
        watchdog.markBusy();
        watchdog.markIdle();
        jest.advanceTimersByTime(300000);

        expect(onSilence).not.toHaveBeenCalled();

        watchdog.stop();
    });

    it('fires again after another full period of silence', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        jest.advanceTimersByTime(61000);

        expect(onSilence).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(30000);

        expect(onSilence).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(31000);

        expect(onSilence).toHaveBeenCalledTimes(2);

        watchdog.stop();
    });

    it('does not fire after stop', () => {
        const watchdog = createWatchdog();

        watchdog.start();
        watchdog.stop();
        jest.advanceTimersByTime(300000);

        expect(onSilence).not.toHaveBeenCalled();
    });

    it('does not fire if never started', () => {
        createWatchdog();
        jest.advanceTimersByTime(300000);

        expect(onSilence).not.toHaveBeenCalled();
    });
});

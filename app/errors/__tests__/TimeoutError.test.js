/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { TimeoutError } from '../';
import constants from '../constants';
import errorMsgs from '../intl';

describe('timeoutError', () => {
    it('should throw default timeout message', () => {
        expect(() => {
            throw new TimeoutError();
        }).toThrow(`${errorMsgs[constants.TIMEOUT]}`);
    });

    it('appends the duration to the serialized message', () => {
        const error = new TimeoutError(5000);

        expect(error.toJSON().message).toBe(`${errorMsgs[constants.TIMEOUT]} (5 seconds)`);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new TimeoutError({ 'message': 'foo' });
        }).toThrow('foo');
    });

    it('keeps an explicit message verbatim in toJSON, suppressing the duration suffix', () => {
        const error = new TimeoutError({ timeout: 5000, message: 'foo' });

        expect(error.toJSON().message).toBe('foo');
    });

    it('should contain correct status code and timeout', () => {
        const error = new TimeoutError(5000);

        expect(error).toHaveProperty('statusCode', 408);
        expect(error).toHaveProperty('timeout', 5000);
    });
});

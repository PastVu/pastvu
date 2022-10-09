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

    it('should throw custom timeout message', () => {
        expect(() => {
            throw new TimeoutError(5000);
        }).toThrow(`${errorMsgs[constants.TIMEOUT]} (5 seconds)`);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new TimeoutError({ 'message': 'foo' });
        }).toThrow('foo');
    });

    it('should contain correct status code and timeout', () => {
        const error = new TimeoutError(5000);

        expect(error).toHaveProperty('statusCode', 408);
        expect(error).toHaveProperty('timeout', 5000);
    });
});

/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { AuthenticationError } from '../index.js';
import constants from '../constants.js';
import errorMsgs from '../intl.js';

describe('authenticationError test', () => {
    it('should throw default message', () => {
        expect(() => {
            throw new AuthenticationError();
        }).toThrow(errorMsgs[constants.AUTHENTICATION]);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new AuthenticationError('foo');
        }).toThrow('foo');
    });

    it('should contain correct status code', () => {
        const error = new AuthenticationError();

        expect(error).toHaveProperty('statusCode', 401);
    });
});

/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { NotFoundError } from '../';
import constants from '../constants';
import errorMsgs from '../intl';

describe('inputError test', () => {
    it('should throw default message', () => {
        expect(() => {
            throw new NotFoundError();
        }).toThrow(errorMsgs[constants.NO_SUCH_RESOURCE]);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new NotFoundError('foo');
        }).toThrow('foo');
    });

    it('should contain correct status code', () => {
        const error = new NotFoundError();

        expect(error).toHaveProperty('statusCode', 404);
    });
});

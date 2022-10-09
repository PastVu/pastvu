/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { BadParamsError } from '../';
import constants from '../constants';
import errorMsgs from '../intl';

describe('badParamsError test', () => {
    it('should throw default message', () => {
        expect(() => {
            throw new BadParamsError();
        }).toThrow(errorMsgs[constants.BAD_PARAMS]);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new BadParamsError('foo');
        }).toThrow('foo');
    });

    it('should contain correct status code', () => {
        const error = new BadParamsError();

        expect(error).toHaveProperty('statusCode', 400);
    });
});

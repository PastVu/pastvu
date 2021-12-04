import { InputError } from '../';
import constants from '../constants';
import errorMsgs from '../intl';

describe('inputError test', () => {
    it('should throw default message', () => {
        expect(() => {
            throw new InputError();
        }).toThrow(errorMsgs[constants.INPUT]);
    });

    it('should throw custom message', () => {
        expect(() => {
            throw new InputError('foo');
        }).toThrow('foo');
    });

    it('should contain correct status code', () => {
        const error = new InputError();

        expect(error).toHaveProperty('statusCode', 400);
    });
});

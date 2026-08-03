/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { parseFilter } from '../photo.js';

describe('gallery sort filter', () => {
    it('default sort - no sort param in filter string', () => {
        const result = parseFilter('');

        expect(result.sort).toBeUndefined();
    });

    it('sort by upload date (ldate)', () => {
        const result = parseFilter('sort!ldate');

        expect(result.sort).toBe('ldate');
    });

    it('sort by last action (cdate)', () => {
        const result = parseFilter('sort!cdate');

        expect(result.sort).toBe('cdate');
    });

    it('sort by last comment (lcomdate)', () => {
        const result = parseFilter('sort!lcomdate');

        expect(result.sort).toBe('lcomdate');
    });

    it('invalid sort field is rejected', () => {
        const result = parseFilter('sort!hacked');

        expect(result.sort).toBeUndefined();
    });
});

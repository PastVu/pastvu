/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

/**
 * Lightweight CLI argv parser. Replacement for the trivial subset of yargs
 * the codebase actually uses.
 *
 * Supported forms:
 *   --key value      → result.key = value (coerced)
 *   --key=value      → result.key = value (coerced)
 *   --key            → result.key = true
 *   --no-key         → result.key = false
 *   -k value         → result.k = value (caller can map short → long via `aliases`)
 *   -k               → result.k = true
 *   foo bar          → result._ = ['foo', 'bar']
 *
 * Numeric and boolean strings are coerced to their primitive types so that
 * downstream code can `lodash.merge` parsed args into structured config.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.argv=process.argv.slice(2)]
 * @param {Object<string,string>} [opts.aliases]  Map of short flag → long key, e.g. { c: 'config' }.
 * @returns {Object<string,unknown> & { _: string[] }}
 */
module.exports = function parseArgv({ argv = process.argv.slice(2), aliases = {} } = {}) {
    const result = { _: [] };

    const assign = (key, value) => {
        const resolved = aliases[key] || key;

        result[resolved] = value;
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith('--')) {
            const body = arg.slice(2);
            const eq = body.indexOf('=');

            if (eq > -1) {
                assign(body.slice(0, eq), coerce(body.slice(eq + 1)));
                continue;
            }

            if (body.startsWith('no-')) {
                assign(body.slice(3), false);
                continue;
            }

            const next = argv[i + 1];

            if (next !== undefined && !next.startsWith('-')) {
                assign(body, coerce(next));
                i++;
            } else {
                assign(body, true);
            }
        } else if (arg.startsWith('-') && arg.length > 1) {
            const body = arg.slice(1);
            const next = argv[i + 1];

            if (next !== undefined && !next.startsWith('-')) {
                assign(body, coerce(next));
                i++;
            } else {
                assign(body, true);
            }
        } else {
            result._.push(arg);
        }
    }

    return result;
};

function coerce(value) {
    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    if (value !== '' && !isNaN(value) && String(Number(value)) === value.trim()) {
        return Number(value);
    }

    return value;
}

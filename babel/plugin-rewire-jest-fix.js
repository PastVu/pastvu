/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

/**
 * Post-rewire babel plugin that patches the one line in babel-plugin-rewire's
 * runtime that breaks under Jest 30's vm sandbox.
 *
 * The unmaintained rewire plugin emits:
 *
 *     globalVariable.__$$GLOBAL_REWIRE_NEXT_MODULE_ID__ = 0;
 *     _RewireModuleId__ = __$$GLOBAL_REWIRE_NEXT_MODULE_ID__++;
 *
 * The bare-identifier `++` writes to globalThis. Plain Node accepts this, but
 * Jest 30's vm sandbox throws "__$$GLOBAL_REWIRE_NEXT_MODULE_ID__ is not
 * defined" in strict mode for any bare-identifier *write* to a property that
 * was added to globalThis after context creation — even when reads of that
 * property succeed.
 *
 * This visitor finds that bare update and rewrites it as a property access on
 * the in-scope `globalVariable` local, which sidesteps the sandbox quirk.
 *
 * Must run after babel-plugin-rewire.
 */
module.exports = function rewireJestFix({ types: t }) {
    const NAME = '__$$GLOBAL_REWIRE_NEXT_MODULE_ID__';

    return {
        name: 'rewire-jest-fix',
        visitor: {
            UpdateExpression(path) {
                const { argument } = path.node;

                if (!t.isIdentifier(argument, { name: NAME })) {
                    return;
                }

                if (!path.scope.hasBinding('globalVariable')) {
                    return;
                }

                path.node.argument = t.memberExpression(
                    t.identifier('globalVariable'),
                    t.identifier(NAME)
                );
            },
        },
    };
};

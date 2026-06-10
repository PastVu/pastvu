/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const HEADER = `/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */`;

const REQUIRED_PREFIX = HEADER + '\n\n';

module.exports = {
    meta: {
        type: 'layout',
        fixable: 'whitespace',
        messages: {
            missing: 'Missing or incorrect copyright header.',
        },
        schema: [],
    },
    create(context) {
        return {
            Program(node) {
                const sourceCode = context.sourceCode;
                const text = sourceCode.getText();

                // Skip any shebang line (e.g. `#!/usr/bin/env node`) before checking the header.
                const shebangMatch = text.match(/^#![^\n]*\n/);
                const startOffset = shebangMatch ? shebangMatch[0].length : 0;
                const after = text.slice(startOffset);

                if (after.startsWith(REQUIRED_PREFIX)) {
                    return;
                }

                const comments = sourceCode.getAllComments();
                const leading = comments.find(c => c.range[0] >= startOffset);
                const hasLeadingBlock = leading && leading.range[0] === startOffset && leading.type === 'Block';

                context.report({
                    node,
                    messageId: 'missing',
                    fix(fixer) {
                        if (hasLeadingBlock) {
                            const trailingNewlines = (text.slice(leading.range[1]).match(/^\n*/) || [''])[0].length;

                            return fixer.replaceTextRange([startOffset, leading.range[1] + trailingNewlines], REQUIRED_PREFIX);
                        }

                        return fixer.insertTextBeforeRange([startOffset, startOffset], REQUIRED_PREFIX);
                    },
                });
            },
        };
    },
};

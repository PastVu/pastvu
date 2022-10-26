/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Babel configuration for nodejs server.
module.exports = {
    comments: false,
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    env: {
        test: {
            plugins: ['rewire'],
        },
    },
};

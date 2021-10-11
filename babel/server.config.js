/**
 * Babel configuration for nodejs server.
 */

module.exports = {
    comments: false,
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
};

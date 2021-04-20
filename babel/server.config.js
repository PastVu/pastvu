/**
 * Babel configuration for nodejs server.
 */

module.exports = {
    comments: false,
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    plugins: [
        // Optional Chaining Operator: 'user.address?.street'
        ['@babel/plugin-proposal-optional-chaining', { loose: true }],
        // Nullish coalescing: x ?? y
        ['@babel/plugin-proposal-nullish-coalescing-operator', { loose: true }],
    ],
};

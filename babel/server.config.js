/**
 * Babel configuration for nodejs server.
 * Node>=12.11 (v8 7.7; it's up to 77 here https://www.chromestatus.com/features)
 */

module.exports = {
    comments: false,
    plugins: [
        // Modules are standardized, but there are no native loaders for them
        // Temporarily allow top level this for diff_match_patch.js
        ['@babel/plugin-transform-modules-commonjs', { allowTopLevelThis: true }],

        // Stage-1 preset
        '@babel/plugin-proposal-export-default-from',

        // Stage-2 preset
        '@babel/plugin-proposal-export-namespace-from',

        // Optional Chaining Operator: 'user.address?.street'
        ['@babel/plugin-proposal-optional-chaining', { loose: true }],
        // Nullish coalescing: x ?? y
        ['@babel/plugin-proposal-nullish-coalescing-operator', { loose: true }],
    ],
};

/**
 * Babel configuration for nodejs server.
 * Node>=6.5 (v8 5.1; it's up to 51 here https://www.chromestatus.com/features)
 */

module.exports = {
    comments: false,
    presets: ['stage-1', 'es2015-node6/object-rest', ['latest', {es2015: false, es2016: true, es2017: true}]],
    plugins: [
        // Externalise references to helpers, automatically polyfilling your code without polluting globals
        ['transform-runtime', {
            // And say not to replace standart library calls with core-js calls,
            // But we still need helpers (like async-to-generator) to not embed them to each file, but import from helpers
            polyfill: false, regenerator: false, helpers: true
        }]
    ]
};
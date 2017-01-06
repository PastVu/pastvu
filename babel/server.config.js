/**
 * Babel configuration for nodejs server.
 * Node>=7.0 (v8 5.4; it's up to 54 here https://www.chromestatus.com/features)
 */

module.exports = {
    comments: false,
    plugins: [
        // Although 'destructuring' and 'parameters' are supported, we still need transformers for them
        // because 'object rest spread' transformer depends on those transformers
        // so babel would have to rewrite it to be independent of it
        // Track https://phabricator.babeljs.io/T7086
        'transform-es2015-destructuring',
        'transform-es2015-parameters',

        // Modules are standardized, but there are no native loaders for them
        'transform-es2015-modules-commonjs',

        // Externalise references to helpers, automatically polyfilling your code without polluting globals
        ['transform-runtime', {
            // And say not to replace standart library calls with core-js calls,
            // But we still need helpers (like async-to-generator) to not embed them to each file, but import from helpers
            polyfill: false, regenerator: false, helpers: true
        }],

        // Stage-1 preset
        'transform-class-constructor-call',
        'transform-export-extensions',

        // Stage-2 preset
        'transform-class-properties',

        // Stage-3 preset
        'transform-async-generator-functions',
        ['transform-object-rest-spread', { useBuiltIns: true }], // useBuiltIns means Object.assign instead of babel extends helper

        // ES2017
        'syntax-trailing-function-commas',
        'transform-async-to-generator'
    ]
};
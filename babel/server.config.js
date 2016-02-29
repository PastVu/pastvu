/**
 * Babel configuration for nodejs server.
 * Node 5.x (v8 4.6; it's up to 46 here https://www.chromestatus.com/features)
 */

module.exports = {
    comments: false,
    presets: ['stage-1', 'es2015-node5'],
    plugins: [
        ['transform-runtime', {
            polyfill: false, regenerator: false
        }]
    ]
};

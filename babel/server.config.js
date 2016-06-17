/**
 * Babel configuration for nodejs server.
 * Node 6.x (v8 5.0; it's up to 50 here https://www.chromestatus.com/features)
 */

module.exports = {
    comments: false,
    presets: ['stage-1', 'es2015-node6/object-rest'],
    plugins: [
        ['transform-runtime', {
            polyfill: false, regenerator: false
        }]
    ]
};

#!/usr/bin/env node
/**
 * Entry point to application. It's purpuse - to run script with transformation
 * This file is not being transformed by babel, nor being checked by eslint and that's why must be written in es5 carefully
 */

var babelConfig = require('../babel/server.config');
var babelOptions = Object.assign({}, babelConfig, {
    only: [
        /(?:app|downloader|middleware|settings|photoConverter|photoCluster|region|connection|_session)\.js/,
        'controllers/constants.js',
        'controllers/comment.js',
        'controllers/reason.js',
        'controllers/photoCluster.js',
        'controllers/photo.js',
        'models/*.js'
    ]
});

if (require.main === module) {
    // If run.js was invoked directly

    var path = require('path');
    var argv = require('yargs')
        .help('help') // --help to get help
        .options('s', {
            'alias': 'script',
            'default': 'app.js',
            describe: 'Path to script to start'
        })
        .argv;

    module.exports = babelRequire(path.resolve(argv.script));
} else {
    // If run.js is required by another fil
    module.exports = babelRequire;
}

/**
 * Require provided module using `Babel` transpiler.
 *
 * @param {String} modulePath - Required module path. Path should *relative from this module* or absolute.
 *   Note: `babelRequire('moduleName')` will be treated as `babelRequire('./moduleName')`.
 * @returns {Module}
 */
function babelRequire(modulePath) {
    var assign = require('lodash/object/assign');

    // Use require-hook babel
    require('babel-core/register')(babelOptions);

    return require(path.resolve(__dirname, modulePath));
}
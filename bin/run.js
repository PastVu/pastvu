#!/usr/bin/env node
/**
 * Entry point to application. It's purpuse - to run script with transformation
 * This file is not being transformed by babel, nor being checked by eslint and that's why it must be written carefully
 */

const startStamp = Date.now();
const babelConfig = require('../babel/server.config');
const babelOptions = Object.assign({}, babelConfig, {
    only: [ // May be array of regexp, or github.com/isaacs/node-glob
        '@(app|downloader).js',
        'controllers/!(api|apilog).js',
        'models/*.js',
        'config/*.js'
    ]
});

if (require.main === module) {
    // If run.js was invoked directly
    const path = require('path');
    const argv = require('yargs')
        .help('help') // --help to get help
        .options('s', {
            'alias': 'script',
            'default': 'app.js',
            describe: 'Path to script to start'
        })
        .options('c', {
            alias: 'config',
            describe: 'Alternative path to config file'
        })
        .argv;

    const requiredModule = babelRequire(path.resolve(argv.script));

    if (typeof requiredModule.configure === 'function') {
        requiredModule.configure(startStamp);
    }

    module.exports = requiredModule;
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
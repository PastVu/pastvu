/**
 * List of files to compile
 */
module.exports = {
    only: [ // May be array of regexp, or github.com/isaacs/node-glob
        '@(app|downloader|uploader).js',
        'controllers/!(api|apilog).js',
        'models/*.js'
    ]
};
/**
 * List of files to compile
 */
module.exports = {
    only: [ // May be array of regexp, or github.com/isaacs/node-glob
        /(app|downloader|uploader|sitemap|notifier|worker).js/,
        /controllers\/((?!systemjs|api|apilog).)+\.js$/,
        'commons/time.js',
        /models\/.+\.js$/,
        /app\/.+\.js$/,
    ],
    ignore: [
        /node_modules/,
    ],
};

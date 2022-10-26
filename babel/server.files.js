/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// List of files to compile.
module.exports = {
    only: [ // May be array of regexp, or github.com/isaacs/node-glob
        /(app|downloader|uploader|sitemap|notifier|worker).js/,
        /controllers\/((?!systemjs|api|apilog).)+\.js$/,
        'commons/Utils.js',
        /models\/.+\.js$/,
        /app\/.+\.js$/,
    ],
    ignore: [
        /node_modules/,
    ],
};

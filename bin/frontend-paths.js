/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const path = require('node:path');
const bootstrapJs = path.join(path.dirname(require.resolve('bootstrap/package.json')), 'js');
const jqueryUiDir = path.dirname(require.resolve('jquery-ui/package.json'));
const trumbowygDist = path.dirname(require.resolve('trumbowyg'));

module.exports = {
    "tpl": "../tpl",
    "style": "../style",
    "m": "module",
    "jquery-ui": jqueryUiDir,
    "jquery-ui/slider": "lib/jquery/ui/slider",
    "jquery-plugins": "lib/jquery/plugins",
    "bs": bootstrapJs,
    "bs/affix": "lib/bootstrap/affix",
    "bs/ext": "lib/bootstrap/ext",
    "bs/tab": "lib/bootstrap/tab",
    "Utils": "lib/Utils",
    "Browser": "lib/Browser",
    "knockout.extends": "lib/knockout/extends",
    "knockout.mapping": "lib/knockout/knockout.mapping",
    "knockout.postbox": "lib/knockout/knockout-postbox",
    "knockout.bs": "lib/knockout/knockout-bootstrap",
    "leaflet-plugins": "lib/leaflet/plugins",
    "leaflet-extends": "lib/leaflet/extends",
    "trumbowyg": path.join(trumbowygDist, 'trumbowyg.min'),
    "trumbowyg-plugins": path.join(trumbowygDist, 'plugins'),
    "trumbowyg-langs": path.join(trumbowygDist, 'langs'),
    "highstock": "lib/highstock",
    "jfileupload": "lib/jquery/plugins/fileupload",
    "load-image": "lib/jquery/plugins/fileupload/load-image",
    "tmpl": "lib/jquery/plugins/fileupload/tmpl",
    "canvas-to-blob": "lib/jquery/plugins/fileupload/canvas-to-blob",
    "noty": "lib/jquery/plugins/noty/jquery.noty",
    "noty.layouts": "lib/jquery/plugins/noty/layouts",
    "noty.themes": "lib/jquery/plugins/noty/themes",
    "intl": "intl/intl"
};

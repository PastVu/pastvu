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
    "jquery-resizable-dom": require.resolve('jquery-resizable-dom'),
    "typeahead.js": require.resolve('typeahead.js/dist/typeahead.bundle.js'),
    "bs": bootstrapJs,
    "bootstrap-datepicker": require.resolve('bootstrap-datepicker/dist/js/bootstrap-datepicker.js'),
    "bootstrap-datepicker/ru": require.resolve('bootstrap-datepicker/js/locales/bootstrap-datepicker.ru.js'),
    "bootstrap-tokenfield": require.resolve('bootstrap-tokenfield/js/bootstrap-tokenfield.js'),
    "Utils": "lib/Utils",
    "Browser": "lib/Browser",
    "knockout.extends": "lib/knockout/extends",
    "knockout.bs": "lib/knockout/knockout-bootstrap",
    "leaflet-plugins": "lib/leaflet/plugins",
    "leaflet-extends": "lib/leaflet/extends",
    "trumbowyg": path.join(trumbowygDist, 'trumbowyg.min'),
    "trumbowyg-plugins": path.join(trumbowygDist, 'plugins'),
    "trumbowyg-langs": path.join(trumbowygDist, 'langs'),
    "jfileupload": "lib/jquery/plugins/fileupload",
    "blueimp-load-image": require.resolve('blueimp-load-image'),
    "noty": "lib/jquery/plugins/noty/jquery.noty",
    "noty.layouts": "lib/jquery/plugins/noty/layouts",
    "noty.themes": "lib/jquery/plugins/noty/themes",
    "intl": "intl/intl"
};

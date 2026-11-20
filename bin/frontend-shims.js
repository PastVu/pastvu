/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Dependencies of vendored browser libraries that do not declare them with AMD define().
// These libraries rely on globals (jQuery, L, …), so their dependencies are imported first
// to run before them. Keys and deps use the same module ids as frontend imports.
// `exports` names the global to use as the module's default export.
// Every bundled vendored library without define() or ES module syntax must be listed here;
// the build fails otherwise. Use `deps: []` for a library with no dependencies.
module.exports = {
    'bs/collapse': { deps: ['jquery', 'bs/transition'] },
    'bs/dropdown': { deps: ['jquery'] },
    'bs/popover': { deps: ['jquery', 'bs/tooltip'] },
    'bs/tooltip': { deps: ['jquery'] },
    'bs/transition': { deps: ['jquery'] },

    'highstock/highstock.src': { deps: ['jquery'], exports: 'Highcharts' },

    'typeahead.js': {
        deps: ['jquery'],
        // Bloodhound's enclosing function has no receiver in a strict module.
        transform: source => source.replace('    })(this);', '    })(window);'),
    },
    'jquery-plugins/plaxmove': { deps: ['jquery'] },

    'leaflet-plugins/Leaflet.GoogleMutant': { deps: ['leaflet'] },
    'leaflet-plugins/Yandex': { deps: ['leaflet'] },

    'trumbowyg': { deps: ['jquery'] },
    'trumbowyg-langs/ru.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/cleanpaste/trumbowyg.cleanpaste.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/colors/trumbowyg.colors.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/fontsize/trumbowyg.fontsize.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/history/trumbowyg.history.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/indent/trumbowyg.indent.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/noembed/trumbowyg.noembed.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/resizimg/trumbowyg.resizimg.min': {
        deps: ['jquery', 'trumbowyg', 'jquery-plugins/jquery-resizable.min'],
    },
    'trumbowyg-plugins/table/trumbowyg.table.min': { deps: ['jquery', 'trumbowyg'] },
};

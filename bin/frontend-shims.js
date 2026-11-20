/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Dependencies of vendored browser libraries that do not declare them with AMD define().
// These libraries rely on globals (jQuery, L, …), so their dependencies are imported first
// to run before them. Keys and deps use the same module ids as frontend imports.
// `exports` names the global to use as the module's default export.
// AMD libraries can have a source transform and declare their own dependencies.
// Every bundled vendored library without define() or ES module syntax must be listed here;
// the build fails otherwise. Use `deps: []` for a library with no dependencies.
module.exports = {
    'blueimp-file-upload': {
        transform: source => source.replace("'jquery.ui.widget'", "'jquery-ui/widget'"),
    },
    'bootstrap-datepicker': { deps: ['jquery'] },
    'bootstrap-datepicker/ru': { deps: ['jquery', 'bootstrap-datepicker'] },
    'bootstrap-tokenfield': {
        transform: source => source
            .replace("define(['jquery'], factory);", "define(['jquery', 'typeahead.js'], factory);")
            // Typeahead selections carry the displayed value and the region's other attributes.
            .replace('// Create token\n          if (_self.createToken( datum )) {',
                "// Create token\n          datum.value = _self.$input.typeahead('val');\n          if (_self.createToken( datum )) {"),
    },

    'imgareaselect': {
        deps: ['jquery'],
        transform: source => {
            const dimensions = [
                'imgWidth = $img.innerWidth();',
                'imgHeight = $img.innerHeight();',
                '($img.outerHeight() - imgHeight)',
                '($img.outerWidth() - imgWidth)',
            ];

            if (!dimensions.every(expression => source.includes(expression))) {
                throw new Error('Unexpected imgAreaSelect source; check the watermark shim');
            }

            // Limit selection to the photo above the watermark.
            return source
                .replace(dimensions[0], 'imgWidth = options.imageWidthScaled || $img.innerWidth();')
                .replace(dimensions[1], 'imgHeight = options.imageHeightScaled || $img.innerHeight();')
                .replace(dimensions[2], '((options.imageHeightScaled || $img.outerHeight()) - imgHeight)')
                .replace(dimensions[3], '((options.imageWidthScaled || $img.outerWidth()) - imgWidth)');
        },
    },

    'bs/affix': { deps: ['jquery'] },
    'bs/collapse': { deps: ['jquery', 'bs/transition'] },
    'bs/dropdown': { deps: ['jquery'] },
    'bs/popover': { deps: ['jquery', 'bs/tooltip'] },
    'bs/tooltip': { deps: ['jquery'] },
    'bs/transition': { deps: ['jquery'] },

    'typeahead.js': {
        deps: ['jquery'],
        // Bloodhound's enclosing function has no receiver in a strict module.
        transform: source => source.replace('    })(this);', '    })(window);'),
    },
    'leaflet.gridlayer.googlemutant': {
        deps: ['leaflet'],
        transform: source => {
            // The pinned browser bundle embeds an LRU implementation. PastVu passes its own cache.
            const bundledCache = /\n\t\/\/ This implementation of LRUMap[\s\S]+?(?=\n\t\/\/ GoogleMutant by)/;
            const cacheInitializer = 'this._lru = new LRUMap(100);';

            if (!bundledCache.test(source) || !source.includes(cacheInitializer)) {
                throw new Error('Unexpected GoogleMutant bundle; check the tile-cache shim');
            }

            return source.replace(bundledCache, '').replace(cacheInitializer, 'this._lru = options.lru;');
        },
    },
    'leaflet-plugins/Yandex': {
        deps: ['leaflet'],
        // The layer can be removed before the Yandex API creates its container.
        transform: source => source.replace('this._container.remove();', 'this._container?.remove();'),
    },

    'noty': { deps: ['jquery'] },
    // Preserve PastVu's notification widths and the offset below the header.
    'noty/layouts/center': {
        deps: ['noty'],
        transform: source => source.replaceAll("'310px'", "'360px'"),
    },
    'noty/layouts/topRight': {
        deps: ['noty'],
        transform: source => source
            .replaceAll("'310px'", "'382px'")
            .replace('top          : 20,', 'top          : 39,')
            .replace('right        : 20,', 'right        : 10,'),
    },

    'trumbowyg': { deps: ['jquery'] },
    'trumbowyg-langs/ru.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/cleanpaste/trumbowyg.cleanpaste.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/colors/trumbowyg.colors.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/fontsize/trumbowyg.fontsize.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/history/trumbowyg.history.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/indent/trumbowyg.indent.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/noembed/trumbowyg.noembed.min': { deps: ['jquery', 'trumbowyg'] },
    'trumbowyg-plugins/resizimg/trumbowyg.resizimg.min': {
        deps: ['jquery', 'trumbowyg', 'jquery-resizable-dom'],
    },
    'trumbowyg-plugins/table/trumbowyg.table.min': { deps: ['jquery', 'trumbowyg'] },
};

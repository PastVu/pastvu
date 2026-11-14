/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Replace custom <gallery> tags in static page content with photo galleries.
// The tag body is a whitespace/comma separated list of photo CIDs.
require(['jquery'], function ($) {
    'use strict';

    function renderGalleries(context) {
        $(context || document).find('gallery').each(function () {
            var $tag = $(this);
            var ids = $.trim($tag.text()).split(/[\s,]+/).filter(Boolean);

            if (!ids.length) {
                $tag.remove();
                return;
            }

            var $gallery = $('<div class="gallery"></div>');

            ids.forEach(function (id) {
                $gallery.append(
                    $('<a class="gallery-item"></a>')
                        .attr('href', '/p/' + id)
                        .append($('<img>').attr('src', '/_p/' + id + 's.jpg'))
                );
            });

            $tag.replaceWith($gallery);
        });
    }

    $(function () {
        renderGalleries();
    });
});

define(['jquery', 'Utils', 'Params', 'globalVM', 'i18n', 'knockout', 'm/_moduleCliche', 'text!tpl/dummy.pug', 'css!style/dummy'], function ($, Utils, P, globalVM, i18n, ko, Cliche, pug) {
    return Cliche.extend({
        pug: pug,
        create: function () {
            this.dummytext = ko.observable(i18n('Stub'));
        },
    });
});

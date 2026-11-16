/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['jquery', 'Utils', 'Params', 'globalVM', 'i18n', 'knockout', 'm/_moduleCliche', 'text!tpl/dummy.pug', 'css!style/dummy'], function ($, Utils, P, globalVM, i18n, ko, Cliche, pug) {
    return Cliche.extend({
        pug: pug,
        create: function () {
            this.dummytext = ko.observable(i18n('Stub'));
        },
    });
});

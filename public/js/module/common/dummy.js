/**
 * Заглушка
 */
define(['jquery', 'Utils', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/dummy.pug', 'css!style/dummy'], function ($, Utils, P, globalVM, ko, Cliche, pug) {
    return Cliche.extend({
        pug: pug,
        create: function () {
            this.dummytext = ko.observable('Заглушка');
        },
    });
});

/*global requirejs:true, require:true, define:true*/
/**
 * Заглушка
 */
define(['jquery', 'Utils', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/dummy.pug', 'css!style/dummy'], function ($, Utils, P, globalVM, ko, Cliche, pug) {
    const child = [];

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.dummytext = ko.observable('Dummy');
        },
    });
});

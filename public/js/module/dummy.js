/*global requirejs:true, require:true, define:true*/
/**
 * Модель управляет верхней панелью
 */
define(['jquery', 'Utils', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/dummy.jade', 'css!style/dummy'], function ($, Utils, P, globalVM, ko, Cliche, jade) {
    var child = [];

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.dummytext = ko.observable('Заглушка');
        }
    });

});
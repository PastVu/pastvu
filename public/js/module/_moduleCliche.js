/*global define*/
/**
 * GlobalParams
 */
define(['jquery', 'Utils', 'underscore', 'knockout', 'globalVM', 'renderer'], function ($, Utils, _, ko, globalVM, renderer) {
    "use strict";

    var repository = globalVM.repository;

    return Utils.Class.extend({
        jade: '',
        childs: null,
        initialize: function (parent, moduleName, container, level, global) {
            if (global) {
                this.id = moduleName;
            } else {
                this.id = Utils.randomString(10);
            }
            this.global = global;
            this.module = moduleName;
            this.container = container;
            this.level = level;
            this.parentModule = parent;
            this.childModules = {};

            this.$container = $(container).append(this.jade.replace('M!M', this.id));
            this.$dom = this.$container.children(":first");

            this.create();

            repository[this.id] = this;
            ko.applyBindings(globalVM, this.$dom[0]);

            if (this.childs) {
                renderer(this, this.childs, this.level + 1);
            }
        },

        create: function () {

        },
        show: function () {

        },
        hide: function () {

        },
        destroy: function () {
            this.hide();
            _.forOwn(this.childModules, function (item, key, object) {
                item.destroy();
            });
            ko.removeNode(this.$dom[0]);
            this.$container.empty();

            delete this.$container;
            delete this.parentModule.childModules[this.id];
            delete globalVM.repository[this.id];
        }
    });
});
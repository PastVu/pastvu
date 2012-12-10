/*global define*/
/**
 * Шаблон для модулей
 */
define(['jquery', 'Utils', 'underscore', 'knockout', 'globalVM', 'renderer'], function ($, Utils, _, ko, globalVM, renderer) {
    "use strict";

    var repository = globalVM.repository;

    return Utils.Class.extend({
        jade: '',
        childs: null,
        initialize: function (parent, moduleName, container, level, options, global) {
            if (global) {
                this.id = moduleName;
            } else {
                this.id = Utils.randomString(10);
            }
            this.global = global;
            this.module = moduleName;
            this.container = container;
            this.level = level;
            this.options = _.extend({}, this.options, options);
            this.parentModule = parent;
            this.childModules = {};
            this.showing = false;

            repository[this.id] = this;

            this.$container = $(container).append(this.jade.replace(/M!M/g, "'" + this.id + "'"));
            this.$dom = this.$container.children(":first");

            this.create();

            if (this.childs) {
                renderer(
                    this.childs,
                    {
                        parent: this,
                        level: this.level + 1
                    }
                );
            }
        },

        create: function () {
            this.show();
        },
        show: function () {
            ko.applyBindings(globalVM, this.$dom[0]);
            this.showing = true;
        },
        hide: function () {
            this.showing = false;
        },
        destroy: function () {
            if (this.showing) {
                this.hide();
            }
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
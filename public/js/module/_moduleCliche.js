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

			this.subscriptions = {}; // Подписки ko
			this.co = {}; // Сomputed модуля

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
			_.forOwn(this.childModules, function (item) {
				item.destroy();
			});

			this.subDispose();

			ko.removeNode(this.$dom[0]);
			this.$container.empty();

			delete this.subscriptions;
			delete this.co;
			delete this.$container;
			delete this.$dom;
			delete this.parentModule.childModules[this.id];
			delete this.parentModule;
			delete globalVM.repository[this.id];
		},
		subDispose: function () {
			var i;
			for (i in this.subscriptions) {
				if (this.subscriptions[i] !== undefined) {
					if (Utils.isType('function', this.subscriptions[i].dispose)) {
						this.subscriptions[i].dispose();
					}
					delete this.subscriptions[i];
				}
			}
			for (i in this.co) {
				if (this.co[i] !== undefined) {
					if (Utils.isType('function', this.co[i].dispose)) {
						this.co[i].dispose();
					}
					delete this.co[i];
				}
			}
		},
		awaitDestroy: function () {
			this.subDispose();
			_.forOwn(this.childModules, function (item) {
				item.awaitDestroy();
			});
		}
	});
});
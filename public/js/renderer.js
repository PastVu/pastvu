/*global requirejs:true, require:true, define:true*/

define([
    'jquery', 'Utils', 'underscore', 'backbone', 'knockout', 'globalVM'
], function ($, Utils, _, Backbone, ko, globalVM) {
    "use strict";
    var repository = globalVM.repository,
        promises = [];

    return function render(parent, modules, level, callback) {
        var replacedContainers = {};
        parent = parent || globalVM;
        level = level || 0;

        _.forOwn(repository, function (existingVM, existingVMKey) {
            if (existingVM.level === level) {
                var savesExisting = false,
                    sameContainer = false,
                    i = modules.length - 1,
                    item;

                while (i >= 0) {
                    item = modules[i];
                    if (existingVM.container === item.container) {
                        if (existingVM.module === item.module) {
                            savesExisting = true;
                            modules.splice(i, 1);
                        } else {
                            sameContainer = true;
                        }
                        break;
                    }
                    i = i - 1;
                }

                if (!savesExisting) {
                    if (sameContainer) {
                        replacedContainers[existingVM.container] = existingVMKey;
                    } else {
                        existingVM.destroy();
                    }
                }
            }
        });

        _.forOwn(modules, function (item, key, object) {
            var dfd = $.Deferred();
            require([item.module], function (VM) {
                if (replacedContainers[item.container]) {
                    repository[replacedContainers[item.container]].destroy();
                }

                var vm = new VM(parent, item.module, item.container, level);

                if (Utils.isObjectType('function', item.callback)) {
                    item.callback.call(window, vm);
                }
                dfd.resolve(vm);
            });
            promises.push(dfd.promise());
        });

        if (Utils.isObjectType('function', callback)) {
            $.when.apply($, promises).then(callback);
        }
    };
});
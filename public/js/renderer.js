/*global requirejs:true, require:true, define:true*/

define([
    'jquery', 'Utils', 'underscore', 'backbone', 'knockout', 'globalVM'
], function ($, Utils, _, Backbone, ko, globalVM) {
    "use strict";
    var repository = globalVM.repository;

    //Помещаем объект промиса в массив, на место имени модуля если есть,
    //чтобы в коллбэке рендера сохранить последовательнсть модулей,
    //даже если какие-то уже были отрендерены ранее в своих контейнерах
    function pushPromise(arr, promise, moduleName) {
        var indexToPush = arr.length;
        if (moduleName) {
            indexToPush = arr.indexOf(moduleName);
        }
        arr.splice(indexToPush, +!!moduleName, promise);
    }

    return function render(parent, modules, level, callback) {
        var replacedContainers = {},
            promises = _.pluck(modules, 'module'); // Массив промисов для возврата модулей в callback функцию
        parent = parent || globalVM;
        level = level || 0;

        /**
         * Уничтожаем не глобальные модули, которых нет в новом списке
         */
        _.forOwn(repository, function (existingVM, existingVMKey) {
            if (!existingVM.global && existingVM.level === level) {
                var savesExisting = false,
                    sameContainer = false,
                    i = modules.length - 1,
                    item,
                    dfd;

                while (i >= 0) {
                    item = modules[i];
                    if (existingVM.container === item.container) {
                        if (existingVM.module === item.module) {
                            savesExisting = true;
                            modules.splice(i, 1);

                            //Вызываем коллбэк для уже существующего модуля
                            if (Utils.isObjectType('function', item.callback)) {
                                item.callback.call(window, existingVM);
                            }

                            //Помещаем модуль в промисы для передачи в общий коллбэк рендера
                            dfd = $.Deferred();
                            pushPromise(promises, dfd.promise(), existingVM.module);
                            dfd.resolve(existingVM);
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

        /**
         * Создаем новые модули
         */
        _.forOwn(modules, function (item, key, object) {
            var dfd = $.Deferred();
            pushPromise(promises, dfd.promise(), item.module);

            require([item.module], function (VM) {
                if (replacedContainers[item.container]) {
                    repository[replacedContainers[item.container]].destroy();
                }

                var vm = new VM(parent, item.module, item.container, level, item.options || {}, item.global);

                //Коллбэк, вызываемый только при создании модлуля, один раз
                if (Utils.isObjectType('function', item.callbackWhenNew)) {
                    item.callback.call(window, vm);
                }
                //Вызываем коллбэк для модуля
                if (Utils.isObjectType('function', item.callback)) {
                    item.callback.call(window, vm);
                }
                dfd.resolve(vm);
            });
        });

        if (Utils.isObjectType('function', callback)) {
            $.when.apply($, promises).then(callback);
        }
    };
});
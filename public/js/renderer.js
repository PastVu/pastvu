/*global define:true*/

define([
	'jquery', 'Utils', 'underscore', 'backbone', 'knockout', 'globalVM', 'lib/doT', 'text!tpl/modal.jade'
], function ($, Utils, _, Backbone, ko, globalVM, doT, dotModal) {
	"use strict";

	var repository = globalVM.repository,
		tplModal,
		defaultOptions = {
			parent: globalVM,
			level: 0,
			context: window
		};

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

	function createModal(modal) {
		if (!tplModal) {
			tplModal = doT.template(dotModal);
		}
		var $modal = $(tplModal(modal)),
			$btns,
			btn,
			i,
			btnClickClosure = function (b) {
				return function (evt) {
					evt.stopPropagation();
					b.click.call(b.ctx, $(this), evt);
				};
			};

		if (modal.btns) {
			$btns = $('.neoModalFoot > .btn', $modal);
			for (i = 0; i < modal.btns.length; i++) {
				btn = modal.btns[i];
				$($btns[i]).on('click', btnClickClosure(btn));
			}
		}
		if (modal.offIcon && modal.offIcon.click) {
			$('.off', $modal).on('click', function (evt) {
				evt.stopPropagation();
				modal.offIcon.click.call(modal.offIcon.ctx, $(this), evt);
			});
		}
		if (modal.curtainClick) {
			$modal
				.on('click', function (evt) {
					evt.stopPropagation();
					modal.curtainClick.click.call(modal.curtainClick.ctx, $(this), evt);
				})
				.find('.neoModal').on('click', function (evt) {
					evt.stopPropagation();
				});
		}
		return $modal.appendTo('body');
	}

	return function render(modules, options) {
		var replacedContainers = {},
			promises = _.pluck(modules, 'module'), // Массив промисов для возврата модулей в callback функцию
			promisesWhenNew = {}; //Хеш имен модулей, которые рендерятся первый раз. Передается последним параметром в коллбэк рендера

		options = _.defaults(options || {}, defaultOptions);

		/**
		 * Уничтожаем не глобальные модули, которых нет в новом списке
		 */
		_.forOwn(repository, function (existingVM, existingVMKey) {
			if (!existingVM.global && existingVM.parentModule === options.parent && existingVM.level === options.level) {
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
							if (Utils.isType('function', item.callback)) {
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
						existingVM.awaitDestroy();
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
		_.forOwn(modules, function (item) {
			var dfd = $.Deferred();
			pushPromise(promises, dfd.promise(), item.module);

			//Если передан объект modal, то модуль должен появится в модальном окне.
			//Создаем разметку модального окна с контейнером внутри и передаем этот параметр в клише модуля
			if (Utils.isType('object', item.modal)) {
				item.modal.$curtain = createModal(item.modal);

				//Для подсчета параметров размера, необходимо забайндить
				ko.applyBindings(globalVM, item.modal.$curtain[0]);
				item.container = item.modal.$curtain[0].querySelector('.neoModalContainer');
			}

			require([item.module], function (VM) {
				if (replacedContainers[item.container]) {
					repository[replacedContainers[item.container]].destroy();
				}

				var vm = new VM({parent: options.parent, moduleName: item.module, modal: item.modal, container: item.container, level: options.level, options: item.options || {}, global: item.global});

				//Коллбэк, вызываемый только при создании модуля, один раз
				if (Utils.isType('function', item.callbackWhenNew)) {
					item.callbackWhenNew.call(item.ctx, vm);
				}
				//Вызываем коллбэк для модуля
				if (Utils.isType('function', item.callback)) {
					item.callback.call(item.ctx, vm);
				}

				promisesWhenNew[item.module] = true;
				dfd.resolve(vm);
			});
		});

		if (Utils.isType('function', options.callback)) {
			$.when.apply($, promises)
				.pipe(function () {
					var dfd = $.Deferred(),
						args = _.toArray(arguments);

					args.push(promisesWhenNew); //Вставляем последним параметром хэш новых модулей
					dfd.resolveWith.apply(dfd, [options.context, args]);

					return dfd;
				})
				.then(options.callback);
		}
	};
});
/**
 * Менеджер путей
 */
define(['jquery', 'underscore', 'Utils', 'backbone', 'knockout', 'globalVM', 'renderer'], function ($, _, Utils, Backbone, ko, globalVM, renderer) {
	"use strict";

	return Backbone.Router.extend({

		initialize: function (options) {
			this.root = '/';
			this.useLeaf = false;
			this.body = ko.observable('');
			this.params = ko.observable({});

			this.routeChanged = ko.observable();

			this.stack = [];
			this.stackHash = {};
			this.stackCurrentIndex = 0;
			this.offset = 0;
			this.currentLeaf = '';
			this.nextLeaf = '';

			this.blockHrefs = false;

			//Указываем корень
			if (options && options.root) {
				this.root = options.root;
				//Для testUrl последний слэш заменяем на (/),
				//чтобы, например, для this.root = '/admin/' подходил путь перехода как '/admin/' так и '/admin'
				this.rootForUrlTest = this.root.charAt(this.root.length-1) === '/' ? this.root.substring(0, this.root.length-1) + '(/)' : this.root;
			}
			//Указываем отслеживать ли историю переходов по url (leaf)
			if (options && _.isBoolean(options.useLeaf)) {
				this.useLeaf = options.useLeaf;
			}

			if (options && options.globalModules) {
				//Регистрируем глобальные модули
				renderer(
					options.globalModules.modules,
					options.globalModules.options
				);
			}

			//Вставляем обработчики модулей обернутые в враппер
			if (options && options.handlers) {
				_.forEach(options.handlers, function (item, key) {
					this[key] = _.wrap(item, this.handlerWrapper);
				}.bind(this));
			}

			//Регистрируем переданные модули
			if (options && options.routes) {
				options.routes.forEach(function (item, index) {
					this.route(item.route, item.handler);
				}.bind(this));
			}

			$(document).on('click', 'a', {prefix: '', body: 'route'}, this.ahrefHandler);
		},

		routes: {
			"*other": "defaultRoute"
		},
		defaultRoute: function (other, params) {
			console.log("Invalid. You attempted to reach:" + other);
			//document.location.href = other;
		},

		handlerWrapper: function (handler, routeParam, getParams) {
			var fragment = Backbone.history.getFragment(),
				body = fragment.indexOf('?') > -1 ? fragment.substring(0, fragment.indexOf('?')) : fragment,
				leaf = this.useLeaf ? (getParams && getParams.l) || '' : this.nextLeaf;

			this.addToStack(body, leaf);
			this.body(body);

			handler.apply(this, Array.prototype.slice.call(arguments, 1));

			this.routeChanged(fragment);
		},

		addToStack: function (route, leaf) {
			var uid = this.root + route + leaf,
				stackNewIndex;

			if (this.useLeaf && this.stackHash[uid]) { // Если уникальный url уже был, значит переместились по истории назад
				stackNewIndex = this.stack.indexOf(uid);
			} else { // Если уникальный url новый, то удаляем все url начиная с текущего (на случай если мы "в прошлом") и вставляем этот новый
				this.stack.splice(this.stackCurrentIndex + 1, this.stack.length - this.stackCurrentIndex - 1, uid).forEach(function (item, inde, array) {
					delete this.stackHash[item];
				}.bind(this));
				this.stackHash[uid] = {root: this.root, route: route, leaf: leaf};
				stackNewIndex = this.stack.length - 1;
			}
			this.offset = stackNewIndex - this.stackCurrentIndex;
			this.stackCurrentIndex = stackNewIndex;

			this.currentLeaf = this.stackHash[this.stack[this.stackCurrentIndex]].leaf;
			this.nextLeaf = Utils.randomString(3);
		},
		getByGo: function (param) {
			var result;

			if (_.isNumber(param)) {
				if (this.stackCurrentIndex + param < 0) {
					result = this.stackHash[this.stack[0]];
				} else if (this.stackCurrentIndex + param > this.stack.length - 1) {
					result = this.stackHash[this.stack[this.stack.length - 1]];
				} else {
					result = this.stackHash[this.stack[this.stackCurrentIndex + param]];
				}
			}
			return result;
		},
		getFlattenStack: function (root, groupBy) {
			var past,
				future;
			if (_.isString(root)) {
				past = [];
				future = [];
				this.stack.forEach(function (item, index, array) {
					if (this.stackHash[item].root === root && this.stackHash[item].route.indexOf(groupBy) === 0) {
						if (index < this.stackCurrentIndex) {
							past.push(_(_.clone(this.stackHash[item], false)).extend({localRoute: this.stackHash[item].route.substr(groupBy.length)}));
						} else if (index > this.stackCurrentIndex) {
							future.push(_(_.clone(this.stackHash[item], false)).extend({localRoute: this.stackHash[item].route.substr(groupBy.length)}));
						}
					}
				}.bind(this));
				return {past: past, future: future};
			}
			return undefined;
		},
		isEdge: function () {
			return this.stackCurrentIndex === (this.stack.length - 1);
		},

		// Навигатор по заданному url
		navigateToUrl: function (url) {
			var body,
				leaf = this.useLeaf && Utils.getURLParameter('l', url);

			if (_.isString(url) && url.length) {
				if (!this.useLeaf) {
					// Если не используем leaf, то просто навигируемся. 'navigate' - метод backbone
					this.navigate(url.substr(this.root.length), {trigger: true, replace: false});
				} else {
					body = url.substring(this.root.length, (url.indexOf('?') > -1 ? url.indexOf('?') : url.length));
					if (_.isString(body) && _.isString(leaf) && this.stack.indexOf(this.root + body + leaf) > -1) {
						window.history.go(this.stack.indexOf(this.root + body + leaf) - this.stackCurrentIndex);
					} else {
						this.navigate(url.substr(this.root.length) + '?l=' + this.nextLeaf, {trigger: true, replace: false});
					}
				}
			}
			body = leaf = null;
		},

		// Глобальный обработчик клика по ссылке
		ahrefHandler: function (evt) {
			var _this = globalVM.router,
				href = this.getAttribute('href'),
				hrefCurrent = location.href,
				pathname = hrefCurrent.substring(hrefCurrent.indexOf(location.pathname), hrefCurrent.indexOf('?') > -1 ? hrefCurrent.indexOf('?') : hrefCurrent.length),
				paramsVals,
				paramsValsCurrent,
				paramsStringNew,
				target = this.getAttribute('target');

			if (!href || href.length === 0 || _this.blockHrefs) {
				evt.preventDefault();
			} else if (target !== '_blank') {
				if (href.indexOf('?') === 0 && href.indexOf('=') > 0) {
					//Если весь href состоит только из параметров '?x=1&y=1'
					paramsVals = Utils.getURLParameters(href);
					paramsValsCurrent = Utils.getURLParameters(hrefCurrent);

					delete paramsValsCurrent.hl; //Удаляем во время перехода hl текущей страницы

					if (_.size(paramsValsCurrent) > 0) {
						paramsStringNew = hrefCurrent.substr(hrefCurrent.indexOf('?')) + '&';
						_(paramsVals).forEach(function (item, key) {
							if (paramsValsCurrent[key]) {
								paramsStringNew = Utils.urlReplaceParameterValue(paramsStringNew, key, item);
							}
						});
					} else {
						paramsStringNew = '?';
					}

					_(paramsVals).forEach(function (item, key) {
						if (!paramsValsCurrent[key]) {
							paramsStringNew += key + '=' + item + '&';
						}
					});

					evt.preventDefault(); //Должен быть внутри этих if, т.к. если они не подходят должен продолжиться стандартный переход по ссылке
					_this.navigateToUrl(pathname + paramsStringNew.substring(0, paramsStringNew.length-1));
				} else if (_this.testUrl(href)) {
					evt.preventDefault();
					_this.navigateToUrl(href);
				}
			}

			_this = href = target = null;
		},
		testUrl: function (url) {
			return _.some(this.routes, function (item) {
				return this._routeToRegExp(this.rootForUrlTest + item.route).test(url);
			}, this);
		},
		// Блокирует переход по ссылкам
		ahrefBlock: function (flag) {
			if (_.isBoolean(flag)) {
				this.blockHrefs = flag;
			} else {
				this.blockHrefs = !this.blockHrefs;
			}
		}
	});
});
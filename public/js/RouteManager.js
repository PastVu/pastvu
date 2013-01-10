/*global requirejs:true, require:true, define:true*/
/**
 * Менеджер путей
 */
define(['jquery', 'Utils', 'underscore', 'backbone', 'knockout', 'globalVM', 'renderer'], function ($, Utils, _, Backbone, ko, globalVM, renderer) {
    "use strict";

    var Router = Backbone.Router.extend({

        initialize: function (options, dfd) {
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
            }
            //Указываем отслеживать ли историю переходов по url (leaf)
            if (options && Utils.isObjectType('boolean', options.useLeaf)) {
                this.useLeaf = options.useLeaf;
            }

            //Регистрируем глобальные модули
            renderer(
                [
                    {module: 'm/auth', container: '#auth', global: true}
                ],
                {
                    parent: globalVM,
                    level: 0,
                    context: this,
                    callback: function (auth) {
                        if (dfd) {
                            $.when(auth.LoadMe()).done(function () {
                                dfd.resolve();
                            });
                        }
                    }
                }

            );

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
                leaf =  this.useLeaf ? (getParams && getParams.l) || '' : this.nextLeaf;

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

            if (Utils.isObjectType('number', param)) {
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
            if (Utils.isObjectType('string', root)) {
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
        ahrefHandler: function (evt) {
            var _this = globalVM.router,
                href = this.getAttribute('href'),
                target = this.getAttribute('target'),
                body = '',
                leaf = _this.useLeaf && Utils.getURLParameter('l', href);

            if (href.length === 0 || this.blockHrefs) {
                evt.preventDefault();
            } else if (target !== '_blank' && href.indexOf(_this.root) > -1) {
                evt.preventDefault();

                if (!_this.useLeaf) {
                    // Если не используем leaf, то просто навигируемся
                    globalVM.router.navigate(href.substr(_this.root.length), {trigger: true, replace: false});
                } else {
                    body = href.substring(_this.root.length, (href.indexOf('?') > -1 ? href.indexOf('?') : href.length));
                    if (_.isString(body) && _.isString(leaf) && _this.stack.indexOf(_this.root + body + leaf) > -1) {
                        window.history.go(_this.stack.indexOf(_this.root + body + leaf) - _this.stackCurrentIndex);
                    } else {
                        globalVM.router.navigate(href.substr(_this.root.length) + '?l=' + _this.nextLeaf, {trigger: true, replace: false});
                    }
                }
            }

            _this = href = target = body = leaf = null;
        },
        ahrefBlock: function (flag) {
            if (Utils.isObjectType('boolean', flag)) {
                this.blockHrefs = flag;
            } else {
                this.blockHrefs = !this.blockHrefs;
            }
        }
    });

    return Router;
});
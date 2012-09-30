/*global requirejs:true, require:true, define:true*/
/**
 * GlobalParams
 */
define(['jquery', 'Utils', 'underscore', 'backbone', 'knockout', 'globalVM', 'renderer'], function ($, Utils, _, Backbone, ko, globalVM, renderer) {
    "use strict";

    var Router = Backbone.Router.extend({

        registerRouters: function () {
            this.route("", "profile");
            this.route(":user", "profile");
        },

        initialize: function (options, dfd) {
            this.base = ko.observable('');
            this.param = ko.observable('');

            this.stack = [];
            this.stackHash = {};
            this.stackCurrentIndex = 0;
            this.offset = 0;
            this.currentLeaf = '';
            this.nextLeaf = '';

            //Регистрируем глобальные модули
            renderer(
                globalVM,
                [
                    {module: 'm/auth', container: '#auth', global: true}
                ],
                0,
                function (auth) {
                    if (dfd) {
                        $.when(auth.LoadMe()).done(function () {
                            dfd.resolve();
                        });
                    }
                }
            );

            this.registerRouters();
        },

        profile: function (user, params) {
            console.log('user Section');

            this.addToStack('u/', user, (params && params.leaf) || '');
            this.base('u/');
            this.param(null);

            renderer(
                globalVM,
                [
                    {module: 'm/top', container: '#top_container'},
                    {module: 'm/userBrief', container: '#user_brief'},
                    {module: 'm/userProfile', container: '#user_profile'}
                ],
                0,
                function (top, home) {
                    //window.setTimeout(function () { $(window).trigger('resize'); }, 500);
                }
            );

        },

        video: function (id, params) {
            console.log('video');

            this.addToStack('video/', id, (params && params.leaf) || '');
            this.base('video');
            this.param(id);

            renderer(
                globalVM,
                [
                    {module: 'm/top', container: '#top_container'},
                    {module: 'm/video', container: '#main_container'}
                ],
                0,
                function (top, video) {
                    //window.setTimeout(function () { $(window).trigger('resize'); }, 500);
                }
            );
        },

        routes: {
            "*other": "defaultRoute"
        },
        defaultRoute: function (other, params) {
            console.log("Invalid. You attempted to reach:" + other);
            document.location.href = other;
        },

        addToStack: function (base, route, leaf) {
            var uid = base + route + leaf,
                stackNewIndex;

            if (this.stackHash[uid]) { // Если уникальный url уже был, значит переместились по истории назад
                stackNewIndex = this.stack.indexOf(uid);
            } else { // Если уникальный url новый, то удаляем все url начиная с текущего (на случай если мы "в прошлом") и вставляем этот новый
                this.stack.splice(this.stackCurrentIndex + 1, this.stack.length - this.stackCurrentIndex - 1, uid).forEach(function (item, inde, array) {
                    delete this.stackHash[item];
                }.bind(this));
                this.stackHash[uid] = {base: base, route: route, leaf: leaf};
                stackNewIndex = this.stack.length - 1;
            }
            this.offset = stackNewIndex - this.stackCurrentIndex;
            this.stackCurrentIndex = stackNewIndex;

            this.currentLeaf = this.stackHash[this.stack[this.stackCurrentIndex]].leaf;
            this.nextLeaf = Utils.randomString(7);
        },
        getByGo: function (param) {
            if (Utils.isObjectType('number', param)) {
                if (this.stackCurrentIndex + param < 0) {
                    return this.stackHash[this.stack[0]];
                } else if (this.stackCurrentIndex + param > this.stack.length - 1) {
                    return this.stackHash[this.stack[this.stack.length - 1]];
                } else {
                    return this.stackHash[this.stack[this.stackCurrentIndex + param]];
                }
            }
            return undefined;
        },
        getFlattenStackByBase: function (param) {
            var past,
                future;
            if (Utils.isObjectType('string', param)) {
                past = [];
                future = [];
                this.stack.forEach(function (item, index, array) {
                    if (this.stackHash[item].base === param) {
                        if (index < this.stackCurrentIndex) {
                            past.push(this.stackHash[item]);
                        } else if (index > this.stackCurrentIndex) {
                            future.push(this.stackHash[item]);
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
                dataset = this.dataset || $(this).data(),
                datasetParent = this.parentNode.dataset || $(this.parentNode).data(),
                base = evt.data.prefix,
                body = _.isString(dataset[evt.data.body]) ? dataset[evt.data.body] : datasetParent[evt.data.body],
                leaf = _.isString(dataset.leaf) ? dataset.leaf : datasetParent.leaf;
            evt.preventDefault();
            if (_.isString(base) && _.isString(body) && _.isString(leaf)) {
                window.history.go(_this.stack.indexOf(base + body + leaf) - _this.stackCurrentIndex);
            } else if (body) {
                globalVM.router.navigate((evt.data.prefix || '') + body + '?leaf=' + _this.nextLeaf, {trigger: true, replace: false});
            }
            dataset = datasetParent = base = body = leaf = null;
        }
    });

    return Router;
});
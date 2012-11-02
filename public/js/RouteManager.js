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
            this.route(":user/photoUpload", "photoUpload");
            this.route(":user/photo", "photo");
        },

        initialize: function (options, dfd) {
            this.base = ko.observable('');
            this.body = ko.observable('');
            this.params = ko.observable({});
            this.param = ko.observable('');

            this.routeChanged = ko.observable();

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

            $(document).on('click', 'a', {prefix: '', body: 'route'}, this.ahrefHandler);
        },

        profile: function (user, params) {
            console.log('User Profile');
            var fragment = Backbone.history.getFragment();

            this.addToStack('u/', user, (params && params.leaf) || '');
            this.base('u/');
            this.body(fragment.indexOf('?') > -1 ? fragment.substring(0, fragment.indexOf('?')) : fragment);
            this.params({user: user || ""});
            this.param(null);

            renderer(
                globalVM,
                [
                    {module: 'm/top', container: '#top_container'},
                    {module: 'm/user/brief', container: '#user_brief'},
                    {module: 'm/user/menu', container: '#user_menu'},
                    {module: 'm/user/profile', container: '#user_profile'}
                ],
                0,
                function (top, home) {
                }
            );

            this.routeChanged(Backbone.history.getFragment());
        },

        photoUpload: function (user, params) {
            console.log('User Photo');
            var fragment = Backbone.history.getFragment();

            this.addToStack('u/', user, (params && params.leaf) || '');
            this.base('u/');
            this.body(fragment.indexOf('?') > -1 ? fragment.substring(0, fragment.indexOf('?')) : fragment);
            this.params({user: user || ""});
            this.param(null);

            renderer(
                globalVM,
                [
                    {module: 'm/top', container: '#top_container'},
                    {module: 'm/user/brief', container: '#user_brief'},
                    {module: 'm/user/menu', container: '#user_menu'},
                    {module: 'm/user/photoUpload', container: '#user_profile'}
                    //{module: 'm/user/photoUpload', container: '#user_profile'}
                ],
                0,
                function (top, home) {
                }
            );

            this.routeChanged(Backbone.history.getFragment());
        },

        photo: function (user, params) {
            console.log('User Photo');
            var fragment = Backbone.history.getFragment();

            this.addToStack('u/', user, (params && params.leaf) || '');
            this.base('u/');
            this.body(fragment.indexOf('?') > -1 ? fragment.substring(0, fragment.indexOf('?')) : fragment);
            this.params({user: user || ""});
            this.param(null);

            renderer(
                globalVM,
                [
                    {module: 'm/top', container: '#top_container'},
                    {module: 'm/user/brief', container: '#user_brief'},
                    {module: 'm/user/menu', container: '#user_menu'},
                    {module: 'm/user/photo', container: '#user_profile'}
                    //{module: 'm/user/photoUpload', container: '#user_profile'}
                ],
                0,
                function (top, home) {
                }
            );

            this.routeChanged(Backbone.history.getFragment());
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
            //document.location.href = other;
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
                a = this,
                parent = a.parentNode,
                href = a.getAttribute('href'),
                base = '/u/',
                body = '',
                leaf = Utils.getURLParameter('leaf', href);

            if (href.indexOf(base) > -1) {
                evt.preventDefault();
                body = href.substring(3, (href.indexOf('?') > -1 ? href.indexOf('?') : href.length));

                if (_.isString(base) && _.isString(body) && _.isString(leaf) && _this.stack.indexOf(base + body + leaf) > -1) {
                    window.history.go(_this.stack.indexOf(base + body + leaf) - _this.stackCurrentIndex);
                } else {
                    globalVM.router.navigate(href.substr(3) + '?leaf=' + _this.nextLeaf, {trigger: true, replace: false});
                }
            } else {

            }
/*
            if (!_.isString(body)) {
                body = Utils.getDataParam(parent, evt.data.body);
            }
            if (!_.isString(leaf)) {
                leaf = Utils.getDataParam(parent, 'leaf');
            }

            if (_.isString(base) && _.isString(body) && _.isString(leaf)) {
                window.history.go(_this.stack.indexOf(base + body + leaf) - _this.stackCurrentIndex);
            } else if (body) {
                globalVM.router.navigate((base || '') + body + '?leaf=' + _this.nextLeaf, {trigger: true, replace: false});
            }*/
            _this = a = parent = base = body = leaf = null;
        }
    });

    return Router;
});
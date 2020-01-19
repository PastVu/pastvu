/**
 * Модель просмотра сессий пользователя
 */
define([
    'underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'renderer', 'noties', 'model/User', 'model/storage',
    'text!tpl/user/sessions.pug', 'css!style/user/sessions', 'bs/collapse'
], function (_, Utils, socket, P, ko, koMapping, Cliche, globalVM, renderer, noties, User, storage, pug) {

    return Cliche.extend({
        pug: pug,
        options: {
            userVM: null
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;

            if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
                this.originUser = storage.userImmediate(this.u.login()).origin;
                this.onlines = ko.observableArray();
                this.offlines = ko.observableArray();
                this.removing = ko.observableArray();

                this.itsMe = this.co.itsMe = ko.computed(function () {
                    return this.auth.iAm.login() === this.u.login();
                }, this);

                this.getSessions(function () {
                    ko.applyBindings(globalVM, this.$dom[0]);
                    this.show();
                }, this);
            } else {
                globalVM.router.navigate('/u/' + this.u.login());
            }
        },
        show: function () {
            this.$dom.find('#accordion').collapse({
                toggle: false
            });
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            clearTimeout(this.nextGetSessionTimeout);
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        applySessions(sessions) {
            this.onlines(sessions.reduce(function (result, session) {
                if (session.isCurrent) {
                    result.unshift(session);
                } else if (session.isOnline) {
                    result.push(session);
                }

                return result;
            }, []));

            this.offlines(sessions.filter(function (session) {
                return !session.isOnline;
            }));
        },

        getSessions: function (cb, ctx) {
            if (this.nextGetSessionTimeout) {
                clearTimeout(this.nextGetSessionTimeout);
                this.nextGetSessionTimeout = null;
            }

            socket.run('session.giveUserSessions', {login: this.u.login()}, true)
                .then(function (result) {
                    this.applySessions(result);

                    if (_.isFunction(cb)) {
                        cb.call(ctx, result);
                    }

                    this.nextGetSessionTimeout = setTimeout(this.getSessions.bind(this), 5000);
                }.bind(this));
        },

        sessionDestroy: function (key) {
            clearTimeout(this.nextGetSessionTimeout);
            this.nextGetSessionTimeout = null;
            this.removing.push(key);

            socket.run('session.destroyUserSession', { login: this.u.login(), key }, true)
                .then(function (result) {
                    this.applySessions(result);
                    this.nextGetSessionTimeout = setTimeout(this.getSessions.bind(this), 5000);
                }.bind(this))
                .finally(function () {
                    this.removing.remove(key);
                }.bind(this))
        },
    });
});
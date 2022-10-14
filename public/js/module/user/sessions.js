/**
 * Модель просмотра сессий пользователя
 */
define([
    'underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'renderer', 'noties', 'model/User', 'model/storage',
    'text!tpl/user/sessions.pug', 'css!style/user/sessions', 'bs/collapse',
], function (_, Utils, socket, P, ko, koMapping, Cliche, globalVM, renderer, noties, User, storage, pug) {
    return Cliche.extend({
        pug: pug,
        options: {
            userVM: null,
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;

            if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
                this.originUser = storage.userImmediate(this.u.login()).origin;
                this.onlines = ko.observableArray();
                this.offlines = ko.observableArray();
                this.archives = ko.observableArray();
                this.archivedCount = ko.observable(0);
                this.archivedShow = ko.observable(false);
                this.archivedFetching = ko.observable(false);
                this.removing = ko.observableArray();

                this.handleShowSession = this.handleShowSession.bind(this);
                this.handleSessionDestroy = this.handleSessionDestroy.bind(this);

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
                toggle: false,
            });
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            clearTimeout(this.nextGetSessionTimeout);
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        applySessions: function (sessions) {
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

            socket.run('session.giveUserSessions', { login: this.u.login(), withArchive: this.archivedShow() }, true)
                .then(function (result) {
                    this.applySessions(result.sessions);

                    if (this.auth.iAm.role() > 9) {
                        this.archivedCount(result.archiveCount);

                        if (result.archiveSessions) {
                            this.archives(result.archiveSessions);
                        }
                    }

                    if (_.isFunction(cb)) {
                        cb.call(ctx, result);
                    }

                    this.nextGetSessionTimeout = setTimeout(this.getSessions.bind(this), 5000);
                }.bind(this));
        },

        toggleArchive: function () {
            if (this.archivedFetching()) {
                return;
            }

            if (this.archivedShow()) {
                this.archivedShow(false);
                this.archives([]);
            } else if (this.archivedCount() && this.auth.iAm.role() > 9) {
                this.archivedFetching(true);
                this.archivedShow(true);

                this.getSessions(function () {
                    this.archivedFetching(false);
                }, this);
            }
        },

        handleSessionDestroy: function (data, evt) {
            const key = data.key;

            evt.stopPropagation();
            clearTimeout(this.nextGetSessionTimeout);
            this.nextGetSessionTimeout = null;
            this.removing.push(key);

            socket.run('session.destroyUserSession', { login: this.u.login(), key: key }, true)
                .then(function (result) {
                    this.applySessions(result.sessions);

                    if (this.auth.iAm.role() > 9) {
                        this.archivedCount(result.archiveCount);
                    }

                    this.nextGetSessionTimeout = setTimeout(this.getSessions.bind(this), 5000);
                }.bind(this))
                .finally(function () {
                    this.removing.remove(key);
                }.bind(this));
        },

        handleShowSession: function (key, archive, online) {
            if (!this.detailVM) {
                renderer(
                    [
                        {
                            module: 'm/user/session',
                            options: { login: this.u.login(), key: key, archive: archive, online: online },
                            modal: {
                                topic: 'Детали сессии',
                                animateScale: true,
                                initWidth: '800px',
                                maxWidthRatio: 0.95,
                                curtainClick: { click: this.handleCloseSession, ctx: this },
                                offIcon: { text: 'Закрыть', click: this.handleCloseSession, ctx: this },
                                btns: [
                                    { css: 'btn-primary', text: 'Закрыть', click: this.handleCloseSession, ctx: this },
                                ],
                            },
                            callback: function (vm) {
                                this.detailVM = this.childModules[vm.id] = vm;
                                ga('send', 'event', 'user', 'session');
                            }.bind(this),
                        },
                    ],
                    {
                        parent: this,
                        level: this.level + 2,
                    }
                );
            }
        },
        handleCloseSession: function () {
            if (this.detailVM) {
                this.detailVM.destroy();
                delete this.detailVM;
            }
        },
    });
});

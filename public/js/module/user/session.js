/**
 * Модель просмотра сессии
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'lib/doT', 'text!tpl/user/session.pug', 'css!style/user/session'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, doT, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            key: '',
            login: '',
            online: false,
            archive: false,
        },
        create: function () {
            this.key = this.options.key;
            this.login = this.options.login;
            this.online = this.options.online;
            this.archive = this.options.archive;
            this.session = null;
            this.ipsHist = ko.observable(true);
            this.ips = ko.observableArray();
            this.ipLast = null;

            this.getSession(function () {
                this.show();
            }, this);
        },
        show: function () {
            ko.applyBindings(globalVM, this.$dom[0]);
            globalVM.func.showContainer(this.$container);

            if (this.modal) {
                this.modal.$curtain.addClass('showModalCurtain');
            }

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        toggleIPs: function () {
            const newVal = !this.ipsHist();

            this.ipsHist(newVal);

            if (newVal) {
                this.ips(this.session.ips);
            } else {
                this.uniquifyIPs();
            }
        },
        uniquifyIPs: function () {
            this.ips(_.uniqBy(this.session.ips, 'ip').map(item => ({ ip: item.ip })));
        },
        getSession: function (cb, ctx) {
            socket.run('session.giveUserSessionDetails', { login: this.login, key: this.key, archive: this.archive }, true)
                .then(function (result) {
                    this.session = result;
                    this.ipLast = _.last(this.session.ips).ip;

                    if (this.session.ips.length > 2) {
                        this.ipsHist(false);
                    }

                    if (this.ipsHist()) {
                        this.ips(this.session.ips);
                    } else {
                        this.uniquifyIPs();
                    }

                    cb.call(ctx);
                }.bind(this))
                .catch(function (error) {
                    cb.call(ctx, error);
                });
        },
    });
});

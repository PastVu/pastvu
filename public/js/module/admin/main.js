/**
 * Модель главной в админке
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
    'text!tpl/admin/main.pug', 'css!style/admin/main',
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            deferredWhenReady: null, // Deffered wich will be resolved when map ready
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];
            this.onlines = ko_mapping.fromJS({
                all: 0, users: 0,
                sessUC: 0, sessUZC: 0, sessUNC: 0, sessAC: 0, sessAZC: 0, sessANC: 0,
                sessWCUC: 0, sessWCAC: 0,
                sockUC: 0, sockAC: 0,
                сusSid: 0, сusLogin: 0, сusId: 0,
                сsessConnected: 0, сsessWaitingConnect: 0, сsessWaitingSelect: 0,
            });
            this.headers = ko.observableArray();
            this.headersWC = ko.observableArray();

            this.giveOnlives(function () {
                ko.applyBindings(globalVM, this.$dom[0]);
                this.show();
            }, this);
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            window.clearTimeout(this.timeoutUpdate);
            this.hide();
            destroy.call(this);
        },

        giveOnlives: function (cb, ctx) {
            if (this.pending) {
                return;
            }

            this.pending = true;
            socket.run('admin.getOnlineStat', undefined, true)
                .then(function (data) {
                    this.pending = false;

                    const headers = [];
                    const headersWC = [];
                    let i;

                    data.sessNCHeaders.sort(headersSort);

                    for (i = data.sessNCHeaders.length; i--;) {
                        headers.unshift(JSON.stringify(data.sessNCHeaders[i], null, ' '));
                    }

                    data.sessWCNCHeaders.sort(headersSort);

                    for (i = data.sessWCNCHeaders.length; i--;) {
                        headersWC.unshift(JSON.stringify(data.sessWCNCHeaders[i], null, ' '));
                    }

                    ko_mapping.fromJS(data, this.onlines);
                    this.headers(headers);
                    this.headersWC(headersWC);

                    if (_.isFunction(cb)) {
                        cb.call(ctx);
                    }

                    this.timeoutUpdate = window.setTimeout(this.giveOnlives.bind(this), 5000);

                    function headersSort(a, b) {
                        let result = 0;

                        if (a.stamp > b.stamp) {
                            result = -1;
                        } else if (a.stamp < b.stamp) {
                            result = 1;
                        }

                        return result;
                    }
                }.bind(this));
        },
    });
});

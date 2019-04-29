/**
 * Выбор причины
 */
define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/reason.pug', 'css!style/common/reason'], function (_, $, Utils, socket, P, globalVM, ko, Cliche, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            action: ''
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.title = ko.observable('');
            this.desc = ko.observable('');
            this.errMsg = ko.observable('');

            this.selections = ko.observableArray();
            this.selectedCid = ko.observable();
            this.selected = this.co.selected = ko.computed(function () {
                var selectedCid = this.selectedCid();
                return _.find(this.selections(), function (item) {
                    return item.cid === selectedCid;
                });
            }, this);
            this.minLength = this.co.minLength = ko.computed(function () {
                var selected = this.selected();
                if (!selected) {
                    return 0;
                }
                return selected.desc.min || (selected.desc.required ? 3 : 0);
            }, this);

            this.fetchReasons(function (data, error) {
                if (!error) {
                    ko.applyBindings(globalVM, this.$dom[0]);
                    this.show();
                }
            }, this);
        },
        show: function () {
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
        fetchReasons: function (cb, ctx) {
            socket.run('reason.giveActionReasons', { action: this.options.action }, true)
                .then(function (data) {
                    data.reasons.forEach(function (reason) {
                        if (!_.isObject(reason.desc)) {
                            reason.desc = {};
                        }
                    });
                    this.selections(data.reasons);
                    this.title(data.reason_text || '');

                    if (data.reasons.length) {
                        this.selectedCid(data.reasons[0].cid);
                    }

                    if (_.isFunction(cb)) {
                        cb.call(ctx, data);
                    }
                }.bind(this));
        },
        getReason: function () {
            var selected = this.selected(),
                cid = Number(selected.cid),
                desc = this.desc(),
                descmin = this.minLength(),
                descmax = selected.desc.max || 1000;

            if (desc.length < descmin || desc.length > descmax) {
                this.errMsg('Description length must be between ' + descmin + ' and ' + descmax + ' symbols');
                return false;
            }
            return { cid: cid, desc: desc };
        }
    });

});
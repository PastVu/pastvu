/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/reason.pug', 'css!style/common/reason'], function (_, $, Utils, socket, P, globalVM, ko, Cliche, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            action: '',
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.title = ko.observable('');
            this.desc = ko.observable('');
            this.errMsg = ko.observable('');

            this.selections = ko.observableArray();
            this.selectedCid = ko.observable();
            this.selected = this.co.selected = ko.computed(function () {
                const selectedCid = this.selectedCid();

                return _.find(this.selections(), function (item) {
                    return item.cid === selectedCid;
                });
            }, this);
            this.minLength = this.co.minLength = ko.computed(function () {
                const selected = this.selected();

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
            const selected = this.selected();
            const cid = Number(selected.cid);
            const desc = this.desc();
            const descmin = this.minLength();
            const descmax = selected.desc.max || 1000;

            if (desc.length < descmin || desc.length > descmax) {
                this.errMsg('Длина описания должна быть в пределах ' + descmin + ' - ' + descmax + ' символов');

                return false;
            }

            return { cid: cid, desc: desc };
        },
    });
});

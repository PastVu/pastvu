/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import 'Utils';
import socket from 'socket';
import 'Params';
import ko from 'knockout';
import 'knockout.mapping';
import Cliche from 'm/_moduleCliche';
import globalVM from 'globalVM';
import 'model/storage';
import 'lib/doT';
import pug from 'tpl/user/session.pug?raw';
import 'style/user/session.css';

export default Cliche.extend({
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

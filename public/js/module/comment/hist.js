/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import Utils from 'Utils';
import socket from 'socket';
import 'Params';
import ko from 'knockout';
import 'knockout.mapping';
import Cliche from 'm/_moduleCliche';
import globalVM from 'globalVM';
import i18n from 'i18n';
import 'model/storage';
import doT from 'lib/doT';
import pug from 'tpl/comment/hist.pug?raw';
import 'style/comment/hist.css';

let tplHist;
const changeFragTexts = {
    f1: '<span class="glyphicon glyphicon-plus"></span> ' + i18n('Fragment added'),
    f2: '<span class="glyphicon glyphicon-retweet"></span> ' + i18n('Fragment changed'),
    f3: '<span class="glyphicon glyphicon-minus"></span> ' + i18n('Fragment removed'),
};

export default Cliche.extend({
    pug: pug,
    options: {
        cid: 0,
        objCid: 0,
        type: 'photo',
    },
    create: function () {
        this.cid = this.options.cid;
        this.objCid = this.options.objCid;
        this.type = this.options.type;
        this.hist_id = {};

        if (!tplHist) {
            tplHist = doT.template(document.getElementById('dothist').text);
        }

        this.getHist(function (err, hists) {
            if (hists && hists.length) {
                const link = '/' + (this.type === 'photo' ? 'p' : 'news') + '/' + this.objCid;

                this.$dom[0].innerHTML = tplHist({
                    hists: hists,
                    fDate: Utils.format.date.relative,
                    link: link,
                    i18n: globalVM.i18n,
                    regionTitle: Utils.regionTitle,
                });
            }

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
    getHist: function (cb, ctx) {
        const self = this;

        socket.run('comment.giveHist', { cid: this.cid, type: this.type }, true)
            .then(function (data) {
                let i = data.hists.length;
                let hist;
                let user;

                while (i--) {
                    hist = data.hists[i];

                    hist.id = i;
                    self.hist_id[i] = hist;

                    if (hist.txt && hist.txtd) {
                        hist.showdiff = ko.observable(true);
                    }

                    if (hist.frag) {
                        hist.frag = changeFragTexts['f' + hist.frag];
                    }

                    user = hist.user;
                    user.avatar = user.avatar ? '/_a/h/' + user.avatar : '/img/caps/avatarth.png';
                }

                cb.call(ctx, null, data.hists);
            })
            .catch(function (error) {
                cb.call(ctx, error);
            });
    },
});

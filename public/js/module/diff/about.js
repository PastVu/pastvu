/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'underscore';
import P from 'Params';
import socket from 'socket';
import ko from 'knockout';
import Cliche from 'm/_moduleCliche';
import globalVM from 'globalVM';
import pug from 'tpl/diff/about.pug?raw';
import 'style/diff/about.css';

export default Cliche.extend({
    pug: pug,
    create: function () {
        this.show();
        this.version = P.settings.version();
    },
    show: function () {
        const self = this;

        socket.run('index.giveAbout').then(function (result) {
            ga('send', 'event', 'about', 'open', 'about open');

            self.avatars = result || {};

            ko.applyBindings(globalVM, self.$dom[0]);
            globalVM.func.showContainer(self.$container);
            self.showing = true;

            if (self.modal) {
                self.modal.$curtain.addClass('showModalCurtain');
            }
        });
    },
    hide: function () {
        globalVM.func.hideContainer(this.$container);
        this.showing = false;
    },
    getAboutUrl: function () {
        const template = _.template(P.settings.docs.aboutUrl);

        return template({ lang: P.settings.lang });
    },
});

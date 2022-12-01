/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'Params', 'socket!', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/diff/about.pug', 'css!style/diff/about'], function (_, P, socket, ko, Cliche, globalVM, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.show();
            this.version = P.settings.version();
        },
        show: function () {
            const self = this;

            socket.run('index.giveAbout').then(function (result) {
                ga('send', 'event', 'about', 'open', 'about open');
                // ga('send', 'pageview', {'page': '/about', 'title': 'О проекте'});

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
});

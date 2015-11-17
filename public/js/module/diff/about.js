/*global define:true, ga:true*/
/**
 * Модель О проекте
 */
define(['underscore', 'Params', 'socket!', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/diff/about.jade', 'css!style/diff/about'], function (_, P, socket, ko, Cliche, globalVM, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.show();
        },
        show: function () {
            var self = this;

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
        }
    });
});
/**
 * Модель Правил
 */
define(
    ['underscore', 'Params', 'socket!', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/diff/rules.pug', 'css!style/diff/rules'],
    function (_, P, socket, ko, Cliche, globalVM, pug) {
        'use strict';

        return Cliche.extend({
            pug: pug,
            create: function () {
                this.show();
            },
            show: function () {
                ga('send', 'event', 'rules', 'open', 'rules open');

                ko.applyBindings(globalVM, this.$dom[0]);
                globalVM.func.showContainer(this.$container);
                this.showing = true;
                if (this.modal) {
                    this.modal.$curtain.addClass('showModalCurtain');
                }
            },
            hide: function () {
                globalVM.func.hideContainer(this.$container);
                this.showing = false;
            }
        });
    });
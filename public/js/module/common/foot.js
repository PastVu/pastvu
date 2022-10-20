define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer', 'text!tpl/common/foot.pug', 'css!style/common/foot'], function (_, P, ko, Cliche, globalVM, renderer, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        create: function () {
            ko.applyBindings(globalVM, this.$dom[0]);

            window.setTimeout(function () {
                this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
                this.routeHandler();
                this.show();
            }.bind(this), 800);
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        routeHandler: function () {
            const params = globalVM.router.params();

            if (params.about) {
                this.showAbout();
            } else if (this.aboutVM) {
                this.destroyAbout();
            }
        },

        navigateAbout: function () {
            globalVM.router.navigate('/about');
        },
        showAbout: function () {
            if (!this.aboutVM) {
                renderer(
                    [
                        {
                            module: 'm/diff/about',
                            modal: {
                                topic: 'About',
                                initWidth: '1000px',
                                //animateScale: true,
                                curtainClick: { click: this.closePopup, ctx: this },
                                offIcon: { text: 'Close', click: this.closePopup, ctx: this },
                                btns: [
                                    { css: 'btn-primary', text: 'Close', click: this.closePopup, ctx: this },
                                ],
                            },
                            callback: function (vm) {
                                this.aboutVM = this.childModules[vm.id] = vm;
                            }.bind(this),
                        },
                    ],
                    {
                        parent: this,
                        level: this.level + 2,
                    }
                );
            }
        },
        destroyAbout: function () {
            if (this.aboutVM) {
                this.aboutVM.destroy();
                delete this.aboutVM;
            }
        },

        closePopup: function () {
            // Закрытие будет вызвано автоматиечски после срабатывания routeHandler
            if (globalVM.router.navigated) {
                globalVM.router.back();
            } else {
                globalVM.router.navigate('/');
            }
        },
        getRulesUrl: function () {
            const template = _.template(P.settings.docs.rulesUrl);

            return template({ lang: P.settings.lang });
        },
    });
});

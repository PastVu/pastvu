/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'Utils', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'text!tpl/main/mainPage.pug', 'css!style/main/mainPage'], function (_, Utils, P, ko, ko_mapping, Cliche, globalVM, Photo, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.map = {};
            this.childs = [
                {
                    module: 'm/map/map',
                    container: '#mapContainer',
                    options: {},
                    ctx: this,
                    callback: function (vm) {
                        this.childModules[vm.id] = vm;
                        this.map = vm;
                        this.map.commentFeedShown(this.isCommentFeedShownByDefault());
                    },
                },
                {
                    module: 'm/main/commentsFeed',
                    container: '#commentsFeed',
                    options: {},
                    ctx: this,
                    callback: function (vm) {
                        this.childModules[vm.id] = vm;
                    },
                },
                {
                    module: 'm/main/bottomPanel',
                    container: '#bottomPanel',
                    options: {},
                    ctx: this,
                    callback: function (vm) {
                        this.childModules[vm.id] = vm;
                    },
                },
            ];

            this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
            ko.applyBindings(globalVM, this.$dom[0]);

            // When comments container is toggled, update state and map bounds.
            $('#commentsFeed').on('hidden.bs.collapse', function () {
                this.map.commentFeedShown(false);
                Utils.setLocalStorage('page.showCommentsFeed', false);
            }.bind(this));
            $('#commentsFeed').on('shown.bs.collapse', function () {
                this.map.commentFeedShown(true);
                Utils.setLocalStorage('page.showCommentsFeed', true);
            }.bind(this));

            this.show();
        },
        show: function () {
            Utils.title.setTitle({ title: 'Main' });
            this.sizesCalc();
            globalVM.func.showContainer(this.$container);
            this.showing = true;
            gtag('event', 'page_view');
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        sizesCalc: function () {
            this.mapSize();
        },
        mapSize: function () {
            this.$dom.find('#mapContainer').css({ height: P.window.h() - (this.$container.offset().top || 33) - 29 >> 0 });
        },
        isCommentFeedShownByDefault: function () {
            const showFeed = Utils.getLocalStorage('page.showCommentsFeed');

            return showFeed !== undefined ? showFeed : true;
        },
    });
});

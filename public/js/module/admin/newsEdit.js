/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche',
    'globalVM', 'model/User', 'model/storage', 'noties', 'text!tpl/admin/newsEdit.pug', 'css!style/admin/newsEdit',
    'trumbowyg', 'css!style/trumbowyg/trumbowyg.css', 'css!style/trumbowyg/trumbowyg.table.css', 'css!style/trumbowyg/trumbowyg.colors.css',
    'bs/ext/datetimepicker/datetimepicker',
], function (_, $, Browser, Utils, socket, P, ko, koMapping, Cliche, globalVM, User, storage, noties, pug) {
    'use strict';

    const trumbowygOptions = {
        lang: P.settings.lang,
        imageWidthModalEdit: true,
        svgPath: '/img/trumbowyg/icons.svg',
        btnsDef: {
            align: {
                dropdown: ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
                ico: 'justifyLeft',
            },
            format: {
                dropdown: ['del', 'underline', 'superscript', 'subscript'],
                ico: 'del',
            },
        },
        btns: [
            ['viewHTML'],
            ['undo', 'redo'],
            ['formatting'],
            ['strong', 'em', 'format'],
            ['fontsize'],
            ['foreColor', 'backColor'],
            ['link'],
            ['insertImage'],
            ['noembed'],
            ['align'],
            ['unorderedList', 'orderedList'],
            ['indent', 'outdent'],
            ['table'],
            ['horizontalRule'],
            ['removeformat'],
            ['fullscreen'],
        ],
    };

    const trumbowygAddons = [
        'trumbowyg-plugins/indent/trumbowyg.indent.min',
        'trumbowyg-plugins/table/trumbowyg.table.min',
        'trumbowyg-plugins/noembed/trumbowyg.noembed.min',
        'jquery-plugins/jquery-resizable.min', // Required for trumbowyg.resizimg.min
        'trumbowyg-plugins/resizimg/trumbowyg.resizimg.min',
        'trumbowyg-plugins/cleanpaste/trumbowyg.cleanpaste.min',
        'trumbowyg-plugins/fontsize/trumbowyg.fontsize.min',
        'trumbowyg-plugins/colors/trumbowyg.colors.min',
    ];

    return Cliche.extend({
        pug: pug,
        options: {},
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];
            this.createMode = ko.observable(true);

            this.tDateExists = ko.observable(false);
            this.noticeExists = ko.observable(false);
            this.news = koMapping.fromJS({
                pdate: '',
                tdate: '',
                title: '',
                notice: '',
                txt: '',
                nocomments: false,
            });


            if (trumbowygOptions.lang !== 'en') {
                trumbowygAddons.push(`trumbowyg-langs/${trumbowygOptions.lang}.min`);
            }

            require(trumbowygAddons, () => {
                this.$dom.find('textarea#newsPrimary').trumbowyg(trumbowygOptions);
            });

            this.$dom.find('#newsPdate').datetimepicker({ defaultDate: new Date(), collapse: false });

            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
            this.routeHandler();

            ko.applyBindings(globalVM, this.$dom[0]);
            this.show();
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.$dom.find('textarea#newsPrimarynewsPrimary').trumbowyg('destroy');
            this.$dom.find('#newsPdate').data('DateTimePicker').disable();
            this.noticeOff();
            this.tDateOff();

            this.hide();
            destroy.call(this);
        },
        routeHandler: function () {
            const cid = Number(globalVM.router.params().cid);

            this.createMode(!cid);

            if (!this.createMode()) {
                this.getOneNews(cid, function () {
                    this.fillData();
                }, this);
            } else {
                this.resetData();
            }
        },
        //TODO: проверить флоу с переходом на другие новости
        resetData: function () {
            this.$dom.find('textarea#newsPrimary').trumbowyg('empty');

            const pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

            pickerP.date(new Date());
            pickerP.show();
            this.noticeOff();
            this.tDateOff();

            this.noticeExists(false);
            this.tDateExists(false);
            koMapping.fromJS({
                pdate: '',
                tdate: '',
                title: '',
                notice: '',
                txt: '',
            }, this.news);
        },
        fillData: function () {
            const primaryTxt = this.news.txt();
            const pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

            pickerP.date(new Date(this.news.pdate() || Date.now()));

            if (primaryTxt) {
                this.$dom.find('textarea#newsPrimary').trumbowyg('html', primaryTxt);
            }

            if (this.news.notice()) {
                this.noticeOn();
            } else {
                this.noticeOff();
                this.news.notice('');
            }

            if (this.news.tdate()) {
                this.tDateOn();
            } else {
                this.tDateOff();
                this.news.tdate('');
            }
        },

        toggleNotice: function () {
            if (this.noticeExists()) {
                this.noticeOff();
            } else {
                this.noticeOn();
            }
        },
        noticeOn: function () {
            this.noticeExists(true);
            this.$dom.find('textarea#newsNotice').trumbowyg(trumbowygOptions).trumbowyg('html', this.news.notice());
        },
        noticeOff: function () {
            if (this.noticeExists()) {
                this.news.notice(this.$dom.find('textarea#newsNotice').trumbowyg('html'));
                this.$dom.find('textarea#newsNotice').trumbowyg('destroy');
                this.noticeExists(false);
            }
        },
        toggleTDate: function () {
            if (this.tDateExists()) {
                this.tDateOff();
            } else {
                this.tDateOn();
            }
        },
        tDateOn: function () {
            this.tDateExists(true);

            const pickerT = this.$dom.find('#newsTdate').datetimepicker().data('DateTimePicker');

            pickerT.date(new Date(this.news.tdate() || Date.now() + 5 * 24 * 60 * 60 * 1000));
        },
        tDateOff: function () {
            if (this.tDateExists()) {
                const pickerT = this.$dom.find('#newsTdate').data('DateTimePicker');

                pickerT.disable();
                this.tDateExists(false);
            }
        },
        getOneNews: function (cid, cb, ctx) {
            socket.run('index.giveNewsFull', { cid: cid }, true)
                .then(function (data) {
                    koMapping.fromJS(data.news, this.news);

                    cb.call(ctx, data);
                }.bind(this));
        },
        save: function () {
            const saveData = koMapping.toJS(this.news);

            if (!this.tDateExists()) {
                delete saveData.tdate;
            } else {
                saveData.tdate = this.$dom.find('#newsTdate').data('DateTimePicker').date().toDate();
            }

            if (this.noticeExists()) {
                saveData.notice = this.$dom.find('textarea#newsNotice').trumbowyg('html');
            } else {
                delete saveData.notice;
            }

            saveData.pdate = this.$dom.find('#newsPdate').data('DateTimePicker').date().toDate();
            saveData.txt = this.$dom.find('textarea#newsPrimary').trumbowyg('html');

            socket.run('admin.saveOrCreateNews', saveData, true)
                .then(function (data) {
                    noties.alert({
                        message: 'Сохранено',
                        type: 'success',
                        layout: 'topRight',
                    });

                    if (this.createMode()) {
                        globalVM.router.navigate('/admin/news/edit/' + data.news.cid);
                    }
                }.bind(this));
        },
        submit: function (data, evt) {
            const $form = $(evt.target);

            $form.find(':focus').blur();

            this.save();

            return false;
        },
    });
});

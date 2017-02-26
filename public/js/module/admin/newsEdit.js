/*global define:true*/

/**
 * Модель создания/редактирования новости
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche',
    'globalVM', 'model/User', 'model/storage', 'noties', 'text!tpl/admin/newsEdit.jade', 'css!style/admin/newsEdit',
    'jquery-plugins/redactor/redactor.min', 'jquery-plugins/redactor/lang/ru', 'css!style/jquery/redactor/redactor',
    'bs/ext/datetimepicker/datetimepicker'
], function (_, $, Browser, Utils, socket, P, ko, koMapping, Cliche, globalVM, User, storage, noties, jade) {
    'use strict';

    var redactorOptions = {
        lang: 'ru',
        buttons: [
            'html', 'formatting', 'bold', 'italic', 'underline', 'deleted', 'unorderedlist', 'orderedlist',
            'outdent', 'indent', 'image', 'video', 'file', 'table', 'link', 'alignment', '|',
            'horizontalrule'
        ]
    };

    return Cliche.extend({
        jade: jade,
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
                nocomments: false
            });

            this.$dom.find('textarea#newsPrimary').redactor(redactorOptions);
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
            this.$dom.find('textarea#newsPrimarynewsPrimary').redactor('destroy');
            this.$dom.find('#newsPdate').data('DateTimePicker').disable();
            this.noticeOff();
            this.tDateOff();

            this.hide();
            destroy.call(this);
        },
        routeHandler: function () {
            var cid = Number(globalVM.router.params().cid);

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
            var primaryRedactor = this.$dom.find('textarea#newsPrimary').redactor('getObject');
            var pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

            primaryRedactor.set(primaryRedactor.opts.emptyHtml);
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
                txt: ''
            }, this.news);
        },
        fillData: function () {
            var primaryRedactor = this.$dom.find('textarea#newsPrimary').redactor('getObject');
            var primaryTxt = this.news.txt();
            var pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

            pickerP.date(new Date(this.news.pdate() || Date.now()));
            if (primaryTxt) {
                primaryRedactor.set(primaryTxt);
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
            this.$dom.find('textarea#newsNotice').redactor(redactorOptions).redactor('set', this.news.notice());
        },
        noticeOff: function () {
            if (this.noticeExists()) {
                var noticeRedactor = this.$dom.find('textarea#newsNotice').redactor('getObject');
                this.news.notice(noticeRedactor.get());
                noticeRedactor.destroy();
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
            var pickerT = this.$dom.find('#newsTdate').datetimepicker().data('DateTimePicker');
            pickerT.date(new Date(this.news.tdate() || (Date.now() + (5 * 24 * 60 * 60 * 1000))));
        },
        tDateOff: function () {
            if (this.tDateExists()) {
                var pickerT = this.$dom.find('#newsTdate').data('DateTimePicker');
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
            var saveData = koMapping.toJS(this.news);

            if (!this.tDateExists()) {
                delete saveData.tdate;
            } else {
                saveData.tdate = this.$dom.find('#newsTdate').data('DateTimePicker').date().toDate();
            }

            if (this.noticeExists()) {
                saveData.notice = this.$dom.find('textarea#newsNotice').redactor('get');
            } else {
                delete saveData.notice;
            }

            saveData.pdate = this.$dom.find('#newsPdate').data('DateTimePicker').date().toDate();
            saveData.txt = this.$dom.find('textarea#newsPrimary').redactor('get');

            socket.run('admin.saveOrCreateNews', saveData, true)
                .then(function (data) {
                    noties.alert({
                        message: 'Сохранено',
                        type: 'success',
                        layout: 'topRight'
                    });
                    if (this.createMode()) {
                        globalVM.router.navigate('/admin/news/edit/' + data.news.cid);
                    }
                }.bind(this));
        },
        submit: function (data, evt) {
            var $form = $(evt.target);
            $form.find(':focus').blur();

            this.save();
            return false;
        }
    });
});
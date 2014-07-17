/*global define:true*/

/**
 * Модель создания/редактирования новости
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/admin/newsEdit.jade', 'css!style/admin/newsEdit',
	'jquery-plugins/redactor/redactor.min', 'jquery-plugins/redactor/lang/ru', 'css!style/jquery/redactor/redactor',
	'bs/ext/datetimepicker/datetimepicker'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
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
		options: {
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];
			this.createMode = ko.observable(true);

			this.tDateExists = ko.observable(false);
			this.noticeExists = ko.observable(false);
			this.news = ko_mapping.fromJS({
				pdate: '',
				tdate: '',
				title: '',
				notice: '',
				txt: '',
				nocomments: false
			});

			this.$dom.find('textarea#newsPrimary').redactor(redactorOptions);
			this.$dom.find('#newsPdate').datetimepicker({defaultDate: new Date()});

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
			var primaryRedactor = this.$dom.find('textarea#newsPrimary').redactor('getObject'),
				pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

			primaryRedactor.set(primaryRedactor.opts.emptyHtml);
			pickerP.setDate(new Date());
			this.noticeOff();
			this.tDateOff();

			this.noticeExists(false);
			this.tDateExists(false);
			ko_mapping.fromJS({
				pdate: '',
				tdate: '',
				title: '',
				notice: '',
				txt: ''
			}, this.news);
		},
		fillData: function () {
			var primaryRedactor = this.$dom.find('textarea#newsPrimary').redactor('getObject'),
				primaryTxt = this.news.txt(),
				pickerP = this.$dom.find('#newsPdate').data('DateTimePicker');

			pickerP.setDate(new Date(this.news.pdate() || Date.now()));
			if (primaryTxt) {
				primaryRedactor.set(primaryTxt);
			}
			if (!!this.news.notice()) {
				this.noticeOn();
			} else {
				this.noticeOff();
				this.news.notice('');
			}
			if (!!this.news.tdate()) {
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
			pickerT.setDate(new Date(this.news.tdate() || (Date.now() + (5 * 24 * 60 * 60 * 1000))));
		},
		tDateOff: function () {
			if (this.tDateExists()) {
				var pickerT = this.$dom.find('#newsTdate').data('DateTimePicker');
				pickerT.disable();
				this.tDateExists(false);
			}
		},
		getOneNews: function (cid, cb, ctx) {
			socket.once('takeNews', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					ko_mapping.fromJS(data.news, this.news);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}, this);
			socket.emit('giveNews', {cid: cid});
		},
		save: function () {
			var saveData = ko_mapping.toJS(this.news);

			if (!this.tDateExists()) {
				delete saveData.tdate;
			} else {
				saveData.tdate = this.$dom.find('#newsTdate').data('DateTimePicker').getDate().toDate();
			}

			if (this.noticeExists()) {
				saveData.notice = this.$dom.find('textarea#newsNotice').redactor('get');
			} else {
				delete saveData.notice;
			}

			saveData.pdate = this.$dom.find('#newsPdate').data('DateTimePicker').getDate().toDate();
			saveData.txt = this.$dom.find('textarea#newsPrimary').redactor('get');

			socket.once('saveNewsResult', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					window.noty({text: 'Сохранено', type: 'success', layout: 'center', timeout: 1800, force: true});
					if (this.createMode()) {
						globalVM.router.navigateToUrl('/admin/news/edit/' + data.news.cid);
					}
				}
			}, this);
			socket.emit('saveNews', saveData);
		},
		submit: function (data, evt) {
			var $form = $(evt.target);
			$form.find(':focus').blur();

			this.save();
			return false;
		}
	});
});
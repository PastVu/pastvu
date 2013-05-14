/*global define:true*/

/**
 * Модель карты
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/admin/newsEdit.jade', 'css!style/admin/newsEdit',
	'jquery-plugins/redactor/redactor', 'css!style/jquery/redactor/redactor',
	'bs/bootstrap-datetimepicker', 'css!style/bootstrap-datetimepicker'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			var cid = Number(globalVM.router.params().cid);

			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];
			this.createMode = ko.observable(!cid);

			this.tDateExists = ko.observable(false);
			this.noticeExists = ko.observable(false);
			this.news = ko_mapping.fromJS({
				pdate: ko.observable(''),
				tdate: ko.observable(''),
				title: ko.observable(''),
				notice: ko.observable(''),
				txt: ko.observable('')
			});

			if (!this.createMode()) {
				this.getOneNews(cid, function () {
					this.makeBinding();
				}, this);
			} else {
				this.makeBinding();
			}
		},
		show: function () {
			var areaPrimary = this.$dom.find('textarea#newsPrimary'),
				datepicker = this.$dom.find('#newsPdate').datetimepicker().data('datetimepicker');

			areaPrimary.redactor();
			if (!this.createMode()) {
				if (this.news.txt()) {
					areaPrimary.setCode(this.news.txt());
				}
				datepicker.setDate(new Date(this.news.pdate() || Date.now()));
			} else {
				datepicker.setDate(new Date());
			}
			if (this.noticeExists()) {
				this.noticeOn();
			}
			if (this.tDateExists()) {
				this.tDateOn();
			}

			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			window.clearTimeout(this.timeoutUpdate);
			this.hide();
			destroy.call(this);
		},
		makeBinding: function () {
			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
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
			this.$dom.find('textarea#newsNotice').redactor().setCode(this.news.notice());
		},
		noticeOff: function () {
			var areaNotice = this.$dom.find('textarea#newsNotice');
			this.news.notice(areaNotice.getCode());
			areaNotice.destroyEditor();
			this.noticeExists(false);
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
			var datepicker = this.$dom.find('#newsTdate').datetimepicker().data('datetimepicker');
			datepicker.setDate(new Date(this.news.tdate() || (Date.now() + (3 * 24 * 60 * 60 * 1000))));
		},
		tDateOff: function () {
			var datepicker = this.$dom.find('#newsTdate').data('datetimepicker');
			datepicker.disable();
			this.tDateExists(false);
		},
		getOneNews: function (cid, cb, ctx) {
			socket.once('takeNews', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					this.noticeExists(!!data.news.notice);
					this.tDateExists(!!data.news.tdate);
					ko_mapping.fromJS(data.news, this.news);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveNews', {cid: cid});
		},
		save: function () {
			var saveData = ko_mapping.toJS(this.news);

			if (!this.tDateExists()) {
				delete saveData.tdate;
			} else {
				saveData.tdate = this.$dom.find('#newsTdate').data('datetimepicker').getDate();
			}

			if (this.noticeExists()) {
				saveData.notice = this.$dom.find('textarea#newsNotice').getCode();
			} else {
				delete saveData.notice;
			}

			saveData.pdate = this.$dom.find('#newsPdate').data('datetimepicker').getDate();
			saveData.txt = this.$dom.find('textarea#newsPrimary').getCode();

			socket.once('saveNewsResult', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					if (this.createMode()) {
						globalVM.router.navigateToUrl('/admin/newsedit/' + data.news.cid);
					}
				}
			}.bind(this));
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
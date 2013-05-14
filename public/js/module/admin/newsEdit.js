/*global define:true*/

/**
 * Модель карты
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/admin/newsEdit.jade', 'css!style/admin/newsEdit', 'jquery-plugins/redactor/redactor', 'css!style/jquery/redactor/redactor'
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

			this.noticeExists = ko.observable(false);
			this.tDateExists = ko.observable(false);
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


			this.subscriptions.noticeExists = this.noticeExists.subscribe(this.noticeHandler, this);

		},
		show: function () {
			var areaPrimary = this.$dom.find('textarea#newsPrimary');
			areaPrimary.redactor();
			if (!this.createMode()) {
				if (this.news.txt()) {
					areaPrimary.setCode(this.news.txt());
				}
				if (this.noticeExists()) {
					this.noticeOn();
				}
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
			this.tDateExists(!this.tDateExists());
		},
		getOneNews: function (cid, cb, ctx) {
			socket.once('takeNews', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					this.noticeExists(!!data.news.notice);
					this.tDateExists(data.news.pdate !== data.news.tdate);
					ko_mapping.fromJS(data.news, this.news);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveNews', {cid: cid});
		}
	});
});
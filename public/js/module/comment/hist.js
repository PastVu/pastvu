/*global define:true*/
/**
 * Модель истории комментария
 */
define(['underscore', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'text!tpl/comment/hist.jade', 'css!style/comment/hist', ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
	'use strict';
	var changeFragTexts = {
		f1: '<i>Добавлен фрагмент</i><br>',
		f2: '<i>Изменен фрагмент</i><br>',
		f3: '<i>Удален фрагмент</i><br>'
	};

	return Cliche.extend({
		jade: jade,
		options: {
			cid: 0
		},
		create: function () {
			this.cid = this.options.cid;
			this.hists = ko.observableArray();
			this.loading = ko.observable(true);

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
			this.getHist();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getHist: function (cb, ctx) {
			this.loading(true);
			socket.once('takeCommentHist', function (data) {
				if (!data || data.error || !Array.isArray(data.hists)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var i = data.hists.length,
						hist,
						user;
					while (i--) {
						hist = data.hists[i];
						if (hist.frag) {
							hist.txt = changeFragTexts['f' + hist.frag] + (hist.txt || '');
						}
						user = hist.user;
						user.avatar = user.avatar ? '/_avatar/th_' + user.avatar : '/img/caps/avatarth.png';
						user.name = ((user.firstName && (user.firstName + ' ') || '') + (user.lastName || '')) || user.login;
					}
					this.hists(data.hists);
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveCommentHist', {cid: this.cid});
		}
	});
});
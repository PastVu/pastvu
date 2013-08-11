/*global define:true*/
/**
 * Модель истории комментария
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'text!tpl/comment/hist.jade', 'css!style/comment/hist', ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
	'use strict';
	var changeFragTexts = {
		f1: '<b>[</b><i class="icon-plus"></i>Добавлен фрагмент<b>]</b>',
		f2: '<b>[</b><i class="icon-retweet"></i> Изменен фрагмент<b>]</b>',
		f3: '<b>[</b><i class="icon-minus"></i>Удален фрагмент<b>]</b>'
	};

	return Cliche.extend({
		jade: jade,
		options: {
			cid: 0,
			type: 'photo'
		},
		create: function () {
			this.cid = this.options.cid;
			this.type = this.options.type;
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
							hist.frag = changeFragTexts['f' + hist.frag];
						}
						user = hist.user;
						user.avatar = user.avatar ? P.preaddr + '/_a/h/' + user.avatar : '/img/caps/avatarth.png';
					}
					this.hists(data.hists);
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveCommentHist', {cid: this.cid, type: this.type});
		}
	});
});
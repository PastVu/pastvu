/*global define:true*/
/**
 * Модель истории комментария
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'lib/doT', 'text!tpl/comment/hist.jade', 'css!style/comment/hist'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, doT, jade) {
	'use strict';
	var tplHist,
		changeFragTexts = {
			f1: '<span class="glyphicon glyphicon-plus"></span> Добавлен фрагмент',
			f2: '<span class="glyphicon glyphicon-retweet"></span> Изменен фрагмент',
			f3: '<span class="glyphicon glyphicon-minus"></span> Удален фрагмент'
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
			this.hist_id = {};

			if (!tplHist) {
				tplHist = doT.template(document.getElementById('dothist').text);
			}

			this.getHist(function (err, hists) {
				if (hists && hists.length) {
					this.$dom[0].innerHTML = tplHist({hists: hists, fDate: Utils.format.date.relative});
				}
				this.show();
			}, this);
		},
		show: function () {
			ko.applyBindings(globalVM, this.$dom[0]);
			globalVM.func.showContainer(this.$container);
			if (this.modal) {
				this.modal.$curtain.addClass('showModalCurtain');
			}
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getHist: function (cb, ctx) {
			socket.once('takeCommentHist', function (data) {
				var error = !data || data.error || !Array.isArray(data.hists);

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var i = data.hists.length,
						hist,
						user;

					while (i--) {
						hist = data.hists[i];

						hist.id = i;
						this.hist_id[i] = hist;

						if (hist.txt && hist.txtd) {
							hist.showdiff = ko.observable(true);
						}
						if (hist.frag) {
							hist.frag = changeFragTexts['f' + hist.frag];
						}
						user = hist.user;
						user.avatar = user.avatar ? P.preaddr + '/_a/h/' + user.avatar : '/img/caps/avatarth.png';
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, error, data.hists);
				}
			}, this);
			socket.emit('giveCommentHist', {cid: this.cid, type: this.type});
		}
	});
});
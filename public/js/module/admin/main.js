/*global define:true*/

/**
 * Модель главной в админке
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
	'text!tpl/admin/main.jade', 'css!style/admin/main'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			deferredWhenReady: null // Deffered wich will be resolved when map ready
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];
			this.onlines = ko_mapping.fromJS({
				all: 0, users: 0,
				sessUC: 0, sessUZC: 0, sessUNC: 0, sessAC: 0, sessAZC: 0, sessANC: 0,
				sessWCUC: 0, sessWCAC: 0,
				sockUC: 0, sockAC: 0
			});
			this.headers = ko.observableArray();
			this.headersWC = ko.observableArray();

			this.giveOnlives(function () {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}, this);
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
			window.clearTimeout(this.timeoutUpdate);
			this.hide();
			destroy.call(this);
		},

		giveOnlives: function (cb, ctx) {
			if (this.pending) {
				return;
			}
			this.pending = true;
			socket.once('takeOnlineStat', function (data) {
				this.pending = false;

				if (!data || data.error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var headers = [],
						headersWC = [],
						i;

					data.sessNCHeaders.sort(headersSort);
					for (i = data.sessNCHeaders.length; i--;) {
						headers.unshift(JSON.stringify(data.sessNCHeaders[i], null, ' '));
					}
					data.sessWCNCHeaders.sort(headersSort);
					for (i = data.sessWCNCHeaders.length; i--;) {
						headersWC.unshift(JSON.stringify(data.sessWCNCHeaders[i], null, ' '));
					}

					ko_mapping.fromJS(data, this.onlines);
					this.headers(headers);
					this.headersWC(headersWC);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx);
				}
				this.timeoutUpdate = window.setTimeout(this.giveOnlives.bind(this), 5000);

				function headersSort(a, b) {
					var result = 0;
					if (a.stamp > b.stamp) {
						result = -1;
					} else if (a.stamp < b.stamp) {
						result = 1;
					}
					return result;
				}
			}, this);
			socket.emit('getOnlineStat');
		}
	});
});
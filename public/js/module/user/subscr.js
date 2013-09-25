/*global define:true*/
/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/storage', 'moment', 'text!tpl/user/subscr.jade', 'css!style/user/subscr'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, moment, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null,
			type: 'photo' //Тип объекта по умолчанию (фото, новость и т.д.)
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;
			this.binded = false;

			if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
				this.type = ko.observable(this.options.type);
				this.objects = ko.observableArray();
				this.nextNoty = ko.observable(null);
				this.loading = ko.observable(false);

				this.types = {
					photo: ko.observable(0),
					news: ko.observable(0)
				};

				this.page = ko.observable(0);
				this.pageSize = ko.observable(0);
				this.pageSlide = ko.observable(2);
				this.pageBase = '/u/' + this.u.login() + '/subscriptions/';

				this.pageLast = this.co.pageLast = ko.computed(function () {
					return ((this.types[this.type()]() - 1) / this.pageSize() >> 0) + 1;
				}, this);
				this.pageHasNext = this.co.pageHasNext = ko.computed(function () {
					return this.page() < this.pageLast();
				}, this);
				this.pageHasPrev = this.co.pageHasPrev = ko.computed(function () {
					return this.page() > 1;
				}, this);
				this.pageFirstItem = this.co.pageFirstItem = ko.computed(function () {
					return this.pageSize() * (this.page() - 1) + 1;
				}, this);
				this.pageLastItem = this.co.pageLastItem = ko.computed(function () {
					return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.types[this.type()]());
				}, this);
				this.pages = this.co.pages = ko.computed(function () {
					var pageCount = this.pageLast(),
						pageFrom = Math.max(1, this.page() - this.pageSlide()),
						pageTo = Math.min(pageCount, this.page() + this.pageSlide()),
						result = [],
						i;

					pageFrom = Math.max(1, Math.min(pageTo - 2 * this.pageSlide(), pageFrom));
					pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * this.pageSlide(), pageTo));

					for (i = pageFrom; i <= pageTo; i++) {
						result.push(i);
					}
					return result;
				}, this);

				this.briefText = this.co.briefText = ko.computed(function () {
					return this.types[this.type()]() > 0 ? 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' +this.types[this.type()]() : 'Пока нет подписок этого типа';
				}, this);

				this.paginationShow = this.co.paginationShow = ko.computed(function () {
					return this.pageLast() > 1;
				}, this);

				this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

				// Subscriptions
				this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
				this.routeHandler();
			} else {
				globalVM.router.navigateToUrl('/u/' + this.u.login());
			}
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
				this.binded = true;
			}
		},

		routeHandler: function () {
			var params = globalVM.router.params(),
				page = Math.abs(Number(params.page)) || 1,
				type = params.type || this.options.type;

			if (!this.types[type]) {
				window.setTimeout(function () {
					globalVM.router.navigateToUrl('/u/' + this.u.login() + '/subscriptions/' + page);
				}.bind(this), 200);
			} else if (this.binded && page > this.pageLast()) {
				window.setTimeout(function () {
					globalVM.router.navigateToUrl('/u/' + this.u.login() + '/subscriptions/' + this.pageLast() + (type !== 'photo' ? '?type=' + type : ''));
				}.bind(this), 200);
			} else if (page !== this.page() || type !== this.type()) {
				this.page(page);
				this.type(type);
				this.getPage(page, type, this.makeBinding, this);
			}
		},

		getPage: function (page, type, cb, ctx) {
			this.loading(true);
			socket.once('takeUserSubscr', function (data) {
				var obj,
					i;

				if (!data || data.error || !Array.isArray(data.subscr)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.page === page && data.type === type) {
					for (i = data.subscr.length; i--;) {
						obj = data.subscr[i];
						if (type === 'photo') {
							obj.link = '/p/' + obj.cid;
							if (P.preaddrs.length > 1) {
								obj.sfile = P.preaddrs[i % P.preaddrs.length] + Photo.picFormats.m + obj.file;
							} else {
								obj.sfile = P.preaddr + Photo.picFormats.m + obj.file;
							}
						} else if (type === 'news') {
							obj.link = '/news/' + obj.cid;
						}
					}
					this.objects(data.subscr);
					this.pageSize(data.perPage || 24);
					this.types.photo(data.countPhoto || 0);
					this.types.news(data.countNews || 0);
					this.nextNoty(data.nextNoty && moment(data.nextNoty) || null);
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserSubscr', {login: this.u.login(), type: type, page: page});
		},

		unSubsc: function (pass) {
		},

		onPreviewLoad: function (data, event) {
			event.target.parentNode.classList.add('showPrv');
		},
		onPreviewErr: function (data, event) {
			event.target.parentNode.classList.add('fail'); //Через запятую работает пока только в chrome
			event.target.parentNode.classList.add('showPrv');
		}
	});
});
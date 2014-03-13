/*global define:true*/
/**
 * Модель списка комментариев пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/user/comments.jade', 'css!style/user/comments'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;
			this.comments = ko.observableArray();
			this.commentsPhotos = {};
			this.loadingComments = ko.observable(false);

			this.page = ko.observable(1);
			this.pageSize = ko.observable(15);
			this.pageSlide = ko.observable(2);

			this.pageLast = this.co.pageLast = ko.computed(function () {
				return ((this.u.ccount() - 1) / this.pageSize() >> 0) + 1;
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
				return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.u.ccount());
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
			this.paginationShow = this.co.paginationShow = ko.computed(function () {
				return this.pageLast() > 1;
			}, this);

			this.briefText = this.co.briefText = ko.computed(function () {
				var count = this.u.ccount(),
					txt = '';
				if (count) {
					txt = 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' + count;
				} else {
					txt = 'Пользователь пока не оставил комментариев в данной категории';
				}
				return txt;
			}, this);

			this.pageUrl = ko.observable('/u/' + this.u.login() + '/comments');
			this.pageQuery = ko.observable('');

			ko.applyBindings(globalVM, this.$dom[0]);

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);

			// Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно, а последующие будут выстреливать сразу
			this.routeHandler();
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

		routeHandler: function () {
			var page = Math.abs(Number(globalVM.router.params().page)) || 1;
			if (page > this.pageLast()) {
				window.setTimeout(function () {
					globalVM.router.navigateToUrl('/u/' + this.u.login() + '/comments/' + this.pageLast());
				}.bind(this), 200);
			} else {
				this.page(page);
				if (this.u.ccount() > 0) {
					this.getPage(page);
				}
			}
		},

		getPage: function (page, cb, ctx) {
			this.loadingComments(true);
			socket.once('takeCommentsUser', function (data) {
				var photo,
					comment,
					commentsToInsert = [],
					i;

				if (!data || data.error || !Array.isArray(data.comments)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.page === page) {
					for (i in data.photos) {
						if (data.photos[i] !== undefined) {
							photo = data.photos[i];
							photo.sfile = Photo.picFormats.q + photo.file;
							photo.link = '/p/' + photo.cid;
							photo.time = '(' + photo.year + (photo.year2 && photo.year2 !== photo.year ? '-' + photo.year2 : '') + ')';
							photo.name = photo.title + ' <span class="photoYear">' + photo.time + '</span>';
							if (P.preaddrs.length > 1) {
								photo.sfile = P.preaddrs[i % P.preaddrs.length] + Photo.picFormats.q + photo.file;
							} else {
								photo.sfile = P.preaddr + Photo.picFormats.q + photo.file;
							}
						}
					}
					this.commentsPhotos = data.photos;

					i = data.comments.length;
					while (i) {
						comment = data.comments[--i];
						if (this.commentsPhotos[comment.obj] !== undefined) {
							comment.link = this.commentsPhotos[comment.obj].link + '?hl=comment-' + comment.cid;
							commentsToInsert.push(comment);
						}
					}
					this.comments(commentsToInsert);
				}
				this.loadingComments(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveCommentsUser', {login: this.u.login(), page: page});
		},
		showHistory: function (cid) {
			if (!this.histVM) {
				renderer(
					[
						{
							module: 'm/comment/hist',
							modal: {
								topic: 'История изменений комментария',
								animateScale: true,
								curtainClick: {click: this.closeHistory, ctx: this},
								offIcon: {text: 'Закрыть', click: this.closeHistory, ctx: this},
								btns: [
									{css: 'btn-primary', text: 'Закрыть', click: this.closeHistory, ctx: this}
								]
							},
							options: {cid: cid},
							callback: function (vm) {
								this.histVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 2
					}
				);
			}
		},
		closeHistory: function () {
			if (this.histVM) {
				this.histVM.destroy();
				delete this.histVM;
			}
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
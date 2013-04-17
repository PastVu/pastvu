/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'm/storage', 'text!tpl/user/comments.jade', 'css!style/user/comments'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			this.auth = globalVM.repository['m/auth'];
			this.u = null;
			this.comments = ko.observableArray();
			this.commentsPhotos = {};
			this.paginationShow = ko.observable(false);
			this.loadingComments = ko.observable(false);

			this.page = ko.observable(1);
			this.pageSize = ko.observable(15);
			this.pageSlide = ko.observable(2);


			var user = globalVM.router.params().user || this.auth.iAm.login();
			storage.user(user, function (data) {
				if (data) {
					this.u = data.vm;

					this.pageLast = ko.computed(function () {
						return ((this.u.ccount() - 1) / this.pageSize() >> 0) + 1;
					}, this);
					this.pageHasNext = ko.computed(function () {
						return this.page() < this.pageLast();
					}, this);
					this.pageHasPrev = ko.computed(function () {
						return this.page() > 1;
					}, this);
					this.pageFirstItem = ko.computed(function () {
						return this.pageSize() * (this.page() - 1) + 1;
					}, this);
					this.pageLastItem = ko.computed(function () {
						return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.u.ccount());
					}, this);
					this.pages = ko.computed(function () {
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

					this.briefText = ko.computed(function () {
						return this.u.ccount() > 0 ? 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' + this.u.ccount() : 'Пользователь пока не оставил ни одного комментария';
					}, this);

					ko.applyBindings(globalVM, this.$dom[0]);

					// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
					// Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно, а последующие будут выстреливать сразу
					this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});
					this.routeHandlerDebounced();

					// Subscriptions
					this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);

					this.show();
				}
			}, this);
		},
		show: function () {
			this.$container.fadeIn();
			this.showing = true;
		},
		hide: function () {
			this.$container.css('display', '');
			this.showing = false;
		},

		routeHandler: function () {
			console.log(99);
			var page = Math.abs(Number(globalVM.router.params().page)) || 1;
			if (page > this.pageLast()) {
				window.setTimeout(function () {
					globalVM.router.navigateToUrl('/u/' + this.u.login() + '/comments/' + this.pageLast())
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
					i;
				if (data.page === page) {
					if (!data || data.error || !Array.isArray(data.comments)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else if (data.page === page) {
						for (i in data.photos) {
							if (data.photos[i] !== undefined) {
								photo = data.photos[i];
								photo.sfile = Photo.picFormats.micro + photo.file;
								photo.link = '/p/' + photo.cid;
								photo.time = '(' + photo.year + (photo.year2 && photo.year2 !== photo.year ? '-' + photo.year2 : '') + ')';
								photo.name = photo.title + ' <span class="photoYear">' + photo.time + '</span>';
							}
						}
						this.commentsPhotos = data.photos;

						i = data.comments.length;
						while (i) {
							comment = data.comments[--i];
							comment.link = this.commentsPhotos[comment.photo].link + '?hl=comment-' + comment.cid;
						}
						this.comments(data.comments);
						if (this.pageLast() > 1) {
							this.paginationShow(true);
						}
					}
					this.loadingComments(false);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveCommentsUser', {login: this.u.login(), page: page});
		},

		onThumbLoad: function (data, event) {
			$(event.target).parents('.photoThumb').animate({opacity: 1});
			data = event = null;
		},
		onThumbError: function (data, event) {
			var $parent = $(event.target).parents('.photoThumb');
			event.target.style.visibility = 'hidden';
			if (data.conv) {
				$parent.addClass('photoConv');
			} else if (data.convqueue) {
				$parent.addClass('photoConvqueue');
			} else {
				$parent.addClass('photoError');
			}
			$parent.animate({opacity: 1});
			data = event = $parent = null;
		}
	});
});
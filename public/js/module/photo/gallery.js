/*global define:true, ga:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/photo/gallery.jade', 'css!style/photo/gallery'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
	'use strict';
	var $window = $(window),
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

	return Cliche.extend({
		jade: jade,
		options: {

		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.photos = ko.observableArray();
			this.feed = ko.observableArray(false);


			this.limit = 42; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
			this.count = ko.observable(0);
			this.loading = ko.observable(false);

			this.scrollActive = false;
			this.scrollHandler = function () {
				if ($window.scrollTop() >= $(document).height() - $window.height() - 50) {
					this.getNextPage();
				}
			}.bind(this);
			this.width = ko.observable('0px');
			this.height = ko.observable('0px');


			this.page = ko.observable(1);
			this.pageSize = ko.observable(this.limit);
			this.pageSlide = ko.observable(2);
			this.paginationShow = ko.observable(false);

			this.pageLast = this.co.pageLast = ko.computed(function () {
				return ((this.count() - 1) / this.pageSize() >> 0) + 1;
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
				return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.count());
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
				return this.count() > 0 ? 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' + this.count() : 'Пользователь пока не оставил ни одного комментария';
			}, this);

			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
			this.routeHandler();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.sizesCalc(P.window.square());
			if (this.options.goUpload) {
				window.setTimeout(this.showUpload.bind(this), 500);
			}
			this.showing = true;
		},
		hide: function () {
			if (this.scrollActive) {
				$window.off('scroll', this.scrollHandler);
				this.scrollActive = false;
			}
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		routeHandler: function () {
			var page = Math.abs(Number(globalVM.router.params().page)) || 1;
			if (page > this.pageLast()) {
				window.setTimeout(function () {
					globalVM.router.navigateToUrl('/ps/' + this.pageLast());
				}.bind(this), 200);
			} else {
				this.page(page);
				this.getPage(page);
			}
		},

		getPage: function (page, cb, ctx) {
			this.loading(true);
			socket.once('takePhotosPublic', function (data) {
				var i;

				if (!data || data.error || !Array.isArray(data.photos)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.page === page) {
					for (i = data.photos.length; i--;) {
						Photo.factory(data.photos[i], 'compact', 'h', {title: 'Без названия'});
					}
					this.count(data.count);
					if (this.pageLast() > 1) {
						this.paginationShow(true);
					}
					this.photos(data.photos);
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('givePhotosPublic', {page: page, limit: this.limit});
		},
		sizesCalc: function () {
			var windowW = window.innerWidth, //В @media ширина считается с учетом ширины скролла (кроме chrome<29), поэтому мы тоже должны брать этот размер
				domW = this.$dom.width(),
				thumbW,
				thumbH,
				thumbN,
				thumbWMin = 120,
				thumbWMax = 246,
				marginMin;

			if (windowW < 1000) {
				thumbN = 4;
				marginMin = 8;
			} else if (windowW < 1441) {
				thumbN = 5;
				marginMin = 10;
			} else {
				thumbN = 6;
				marginMin = 14;
			}
			thumbW = Math.max(thumbWMin, Math.min(domW / thumbN - marginMin - 2, thumbWMax)) >> 0;
			thumbH = thumbW / 1.5 >> 0;
			//thumbW = thumbH * 1.5;

			//margin = ((domW % thumbW) / (domW / thumbW >> 0)) / 2 >> 0;

			this.width(thumbW + 'px');
			this.height(thumbH + 'px');
		},
		/*
		getForUser: function () {
			this.photos([]);
			$window.off('scroll', this.scrollHandler);
			this.scrollActive = false;
			if (this.u.pcount() > 0 || this.auth.iAm.login() === this.u.login() || this.auth.iAm.role()) {
				this.getPage(0, this.canAdd() ? this.limit - 1 : this.limit);
				$window.on('scroll', this.scrollHandler);
				this.scrollActive = true;
			}
		},
		getPage: function (start, limit) {
			this.getPhotos(start, limit, function (data) {
				if (!data || data.error) {
					return;
				}
				if (data.photos && data.photos.length) {
					this.photos.concat(data.photos, false);
				}
				if (this.scrollActive && limit > data.photos.length) {
					$window.off('scroll', this.scrollHandler);
					this.scrollActive = false;
				}
			}, this);
		},
		getNextPage: function () {
			if (!this.loading()) {
				this.getPage(this.photos().length, this.limit);
			}
		},
		getPhotos: function (skip, limit, cb, ctx) {
			socket.once('takeUserPhotos', function (data) {
				if (!data || data.error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					for (var i = data.photos.length; i--;) {
						Photo.factory(data.photos[i], 'compact', 'h', {title: 'Без названия'});
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
				this.loading(false);
			}.bind(this));
			socket.emit('giveUserPhotos', {login: this.u.login(), skip: skip, limit: limit});
			this.loading(true);
		},
		getPhotosPrivate: function (cb, ctx) {
			this.loading(true);
			socket.once('takeUserPhotosPrivate', function (data) {
				if (data && !data.error && data.len > 0) {
					var currArray = this.photos(),
						needSort,
						needReplacement,
						i;

					if (data.disabled && data.disabled.length) {
						for (i = data.disabled.length; i--;) {
							currArray.push(Photo.factory(data.disabled[i], 'compact', 'h', {title: 'Без названия'}));
						}
						needReplacement = needSort = true;
					}
					if (data.del && data.del.length) {
						for (i = data.del.length; i--;) {
							currArray.push(Photo.factory(data.del[i], 'compact', 'h', {title: 'Без названия'}));
						}
						needReplacement = needSort = true;
					}
					if (needSort) {
						currArray.sort(function (a, b) {
							return a.adate < b.adate ? 1 : (a.adate > b.adate ? -1 : 0);
						});
					}

					if (data.fresh && data.fresh.length) {
						for (i = data.fresh.length; i--;) {
							currArray.unshift(Photo.factory(data.fresh[i], 'compact', 'h', {title: 'Без названия'}));
						}
						needReplacement = true;
					}

					if (needReplacement) {
						this.photos(currArray);
					}
					currArray = i = null;
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserPhotosPrivate', {login: this.u.login(), startTime: this.photos().length > 0 ? _.last(this.photos()).adate : undefined, endTime: undefined});
		},
		showUpload: function () {
			if (!this.uploadVM) {
				this.waitUploadSince = new Date();
				renderer(
					[
						{
							module: 'm/user/photoUpload',
							modal: {
								initWidth: '1000px',
								topic: 'Загрузка фотографий',
								closeTxt: 'Завершить',
								closeFunc: function (evt) {
									this.uploadVM.createPhotos(function (data) {
										if (data && !data.error) {
											this.closeUpload(data.cids.length);
											ga('send', 'event', 'photo', 'create', 'photo create success', data.cids.length);
										} else {
											ga('send', 'event', 'photo', 'create', 'photo create error');
										}
									}, this);
									evt.stopPropagation();
								}.bind(this)},
							callback: function (vm) {
								this.uploadVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 1
					}
				);
			}
		},
		closeUpload: function (newCount) {
			if (this.uploadVM) {
				this.uploadVM.destroy();

				if (newCount) {
					socket.once('takePhotosFresh', function (data) {
						if (!data || data.error) {
							window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
						} else {
							if (data.photos.length > 0) {
								var i = data.photos.length;
								while (i--) {
									Photo.factory(data.photos[i], 'compact', 'h');
								}
								this.photos.concat(data.photos, true);
							}
						}
						this.loading(false);
					}.bind(this));
					socket.emit('givePhotosFresh', {login: this.u.login(), after: this.waitUploadSince});
				}

				delete this.uploadVM;
				delete this.waitUploadSince;
				globalVM.router.navigateToUrl('/u/' + this.u.login() + '/photo');
			}
		},*/

		onPreviewLoad: function (data, event) {
			event.target.parentNode.parentNode.classList.add('showPrv');
		},
		onPreviewErr: function (data, event) {
			var $photoBox = $(event.target.parentNode),
				parent = $photoBox[0].parentNode,
				content = '';

			event.target.style.visibility = 'hidden';
			if (data.conv) {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;', txt: 'Превью уже создается<br>пожалуйста, обновите позже'});
			} else if (data.convqueue) {
				content = imgFailTpl({style: 'margin-top:7px;', txt: '<i class="icon-white icon-road"></i><br>Превью скоро будет создано<br>пожалуйста, обновите позже'});
			} else {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: 'Превью недоступно'});
			}
			$photoBox.append(content);
			parent.classList.add('showPrv');
		}
	});
});
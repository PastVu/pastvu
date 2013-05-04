/*global define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/user/gallery.jade', 'css!style/user/gallery'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
	'use strict';
	var $window = $(window);

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null,
			canAdd: false,
			goUpload: false
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;
			this.photos = ko.observableArray();
			this.limit = 42; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
			this.loadingPhoto = ko.observable(false);
			this.scrollActive = false;
			this.scrollHandler = function () {
				if ($window.scrollTop() >= $(document).height() - $window.height() - 50) {
					this.getNextPage();
				}
			}.bind(this);
			this.width = ko.observable('0px');
			this.height = ko.observable('0px');

			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.subscriptions.login = this.u.login.subscribe(this.getForUser, this);
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			this.canAdd = this.co.canAdd = ko.computed(function () {
				return this.options.canAdd && this.u.login() === this.auth.iAm.login();
			}, this);

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
			this.getForUser();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.sizesCalc(P.window.square());
			if (this.options.goUpload) {
				window.setTimeout(this.showUpload.bind(this), 400);
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

		loggedInHandler: function () {
			// После логина перезапрашиваем ленту фотографий пользователя
			if (this.u.pcount() > 0) {
				this.getPhotosPrivate(function (data) {
					if (data && !data.error && data.length > 0 && this.photos().length < this.limit * 1.5) {
						this.getNextPage();
					}
				}, this);
			}
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		getForUser: function () {
			this.photos([]);
			$window.off('scroll', this.scrollHandler);
			this.scrollActive = false;
			if (this.u.pcount() > 0) {
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
				this.photos.concat(data, false);
				if (this.scrollActive && this.photos().length >= this.u.pcount()) {
					$window.off('scroll', this.scrollHandler);
					this.scrollActive = false;
				}
			}, this);
		},
		getNextPage: function () {
			if (!this.loadingPhoto()) {
				this.getPage(this.photos().length, this.limit);
			}
		},
		getPhotos: function (skip, limit, cb, ctx) {
			socket.once('takeUserPhotos', function (data) {
				if (!data || data.error) {
					window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					data.forEach(function (item, index, array) {
						Photo.factory(item, 'compact', 'thumb', {title: 'No title yet'});
					});
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
				this.loadingPhoto(false);
			}.bind(this));
			socket.emit('giveUserPhotos', {login: this.u.login(), skip: skip, limit: limit});
			this.loadingPhoto(true);
		},
		getPhotosPrivate: function (cb, ctx) {
			if (this.photos().length === 0) {
				return;
			}
			socket.once('takeUserPhotosPrivate', function (data) {
				if (!data || data.error || data.length === 0) {
					//window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var currArray = this.photos();

					data.forEach(function (item, index, array) {
						Photo.factory(item, 'compact', 'thumb', {title: 'No title yet'});
					});

					Array.prototype.push.apply(currArray, data);

					currArray.sort(function (a, b) {
						if (a.adate < b.a) {
							return 1;
						} else if (a.adate > b.adate) {
							return -1;
						} else {
							return 0;
						}
					});

					this.photos(currArray);
					currArray = null;
				}
				this.loadingPhoto(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserPhotosPrivate', {login: this.u.login(), startTime: _.last(this.photos()).adate, endTime: undefined});
			this.loadingPhoto(true);
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
		},
		sizesCalc: function (v) {
			var windowW = P.window.w(),
				domW = this.$dom.width() - 1, //this.$container.width()
				thumbW,
				thumbH,
				thumbN,
				thumbWMin = 120,
				thumbWMax = 246,
				marginMin;

			//Так как в @media firefox считает ширину с учетом ширины скролла,
			//то прибавляем эту ширину и здесь для правильного подсчета маргинов
			if (Browser.engine === 'GECKO') {
				windowW += window.innerWidth - windowW;
			}

			if (windowW < 1000) {
				thumbN = 4;
				marginMin = 8;
			} else if (windowW < 1366) {
				thumbN = 5;
				marginMin = 10;
			} else {
				thumbN = 6;
				marginMin = 14;
			}
			thumbW = Math.max(thumbWMin, Math.min(domW / thumbN - marginMin - 2, thumbWMax));
			thumbH = thumbW / 1.5 >> 0;
			thumbW = thumbH * 1.5;

			//margin = ((domW % thumbW) / (domW / thumbW >> 0)) / 2 >> 0;

			this.width(thumbW + 'px');
			this.height(thumbH + 'px');

			windowW = domW = thumbW = thumbH = null;
		},

		showUpload: function () {
			if (!this.uploadVM) {
			this.$dom.find('.photoUploadCurtain')
				.css({display: 'block'})
				.delay(50)
				.queue(function (next) {
					this.classList.add('showUpload');
					next();
				})
				.delay(400)
				.queue(function (next) {
					renderer(
						[
							{module: 'm/user/photoUpload', container: '.modalContainer', options: {popup: true}, callback: function (vm) {
								this.uploadVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)}
						],
						{
							parent: this,
							level: this.level + 1
						}
					);
					next();
				}.bind(this));
			}
		},
		closeUpload: function () {
			if (this.uploadVM) {
				this.$dom.find('.photoUploadCurtain').css({display: ''}).removeClass('showUpload');
				this.uploadVM.destroy();
				delete this.uploadVM;

				var oldFirst = this.photos()[0] ? this.photos()[0].file : 0;
				this.getPhotos(0, 11, function (data) {
					if (!data || data.error) {
						return;
					}
					if (oldFirst === 0) {
						this.photos.concat(data, false);
					} else {
						var intersectionIndex = data.reduce(function (previousValue, currentValue, index, array) {
							if (previousValue === 0 && currentValue.file === oldFirst) {
								return index;
							} else {
								return previousValue;
							}
						}.bind(this), 0);
						if (intersectionIndex > 0) {
							this.photos.concat(data.slice(0, intersectionIndex), true);
						}
					}

				}, this);
			}
		}
	});
});
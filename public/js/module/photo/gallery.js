/*global define:true, ga:true*/
/**
 * Модель галереи фотографий
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/photo/gallery.jade', 'css!style/photo/gallery'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
	'use strict';
	var $window = $(window),
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

	return Cliche.extend({
		jade: jade,
		options: {
			addPossible: false,
			userVM: null,
			goUpload: false,
			topTitle: '',
			filter: {}
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;
			this.topTitle = ko.observable(this.options.topTitle);

			this.filter = {};
			this.photos = ko.observableArray();
			this.feed = ko.observable(false);

			this.count = ko.observable(0);
			this.limit = 30; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
			this.loading = ko.observable(false);

			this.scrollActive = false;
			this.scrollHandler = function () {
				if ($window.scrollTop() >= $(document).height() - $window.height() - 140) {
					this.getNextPage();
				}
			}.bind(this);

			this.panelW = ko.observable('0px');
			this.w = ko.observable('0px');
			this.h = ko.observable('0px');

			this.page = ko.observable(1);
			this.pageSize = ko.observable(this.limit);
			this.pageSlide = ko.observable(2);

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
			this.paginationShow = this.co.paginationShow = ko.computed(function () {
				return !this.feed() && this.pageLast() > 1;
			}, this);

			this.briefText = this.co.briefText = ko.computed(function () {
				var count = this.count(),
					txt = '';
				if (count) {
					if (this.feed()) {
						txt = 'Всего ' + count + ' фотографий';
					} else {
						txt = 'Показаны ' + this.pageFirstItem() + ' - ' + this.pageLastItem() + ' из ' + count;
					}
				} else {
					txt = 'Пока нет ни одной фотографии';
				}
				return txt;
			}, this);

			if (this.u) {
				this.userModeAdditions();
				this.pageUrl = ko.observable('/u/' + this.u.login() + '/photo');
			} else {
				this.pageUrl = ko.observable('/ps');
			}
			this.pageQuery = ko.observable('');

			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);

			this.sizesCalc();
			this.routeHandler();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			if (this.u && this.options.goUpload) {
				window.setTimeout(this.showUpload.bind(this), 500);
			}
			this.showing = true;
		},
		hide: function () {
			this.scrollDeActivate();
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		userModeAdditions: function () {
			this.canAdd = this.co.canAdd = ko.computed(function () {
				return this.options.addPossible && this.u.login() === this.auth.iAm.login() && (this.feed() || this.page() === 1);
			}, this);

			this.subscriptions.login = this.u.login.subscribe(this.changeUserHandler, this); //Срабатывает при смене пользователя
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
		},
		loggedInHandler: function () {
			// После логина перезапрашиваем фотографии пользователя
			if (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role()) {
				if (this.feed()) {
					if (!this.filter.nogeo) {
						//В режиме ленты запрашиваем приватные и подмешиваем в текущие
						this.loading(true);
						this.receivePhotosPrivate(function (data) {
							this.loading(false);
							if (data && !data.error && data.len > 0 && this.photos().length < this.limit * 1.5) {
								this.getNextPage();
							}
						}, this);
					}
				} else {
					//В постраничном режиме просто перезапрашиваем страницу
					this.getPhotos((this.page() - 1) * this.limit, this.limit);
				}
			}
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		changeUserHandler: function () {
			this.photos([]);
		},

		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.binded = true;
				this.show();
			}
		},
		routeHandler: function () {
			var params = globalVM.router.params(),
				filterParams = params.f && params.f.split(';'),
				newFilter = {},
				filterChange = false,
				page = params.page,
				currPhotoLength = this.photos().length,
				needRecieve = true,
				preTitle = '',
				i;

			// Если сразу открываем загрузку, то обрабатываем галерею как обычный запуск, т.е. page будет 1
			// Если галерея уже загружена и затем открываем загрузку, то ничего делать не надо
			if (this.binded && params.photoUpload) {
				return;
			}

			// Если показывается окно загрузки, но в параметрах его нет,
			// значит мы вернулись из загрузки в галерею и должны загрузку закрыть
			if (this.uploadVM && !params.photoUpload) {
				this.closeUpload(0);
				return;
			}

			//Параметры фильтров
			if (filterParams) {
				for (i = filterParams.length; i--;) {
					newFilter[filterParams[i]] = true;
					if (!this.filter[filterParams[i]]) {
						filterChange = true; //Если нового параметра нет в текущих, говорим об изменении
					}
				}
				for (i in this.filter) {
					if (this.filter[i] !== undefined && !newFilter[i]) {
						filterChange = true; //Если старого параметра нет в новых, говорим об изменении
					}
				}
				this.filter = newFilter;

				if (this.filter.nogeo) {
					preTitle = 'Где это? - ';
					if (this.options.topTitle) {
						this.topTitle = ko.observable('Где это? ' + this.options.topTitle);
					}
				}
				this.pageQuery(location.search);
			}

			if (page === 'feed') {
				page = 1;
				this.feed(true);
				this.scrollActivate();
				if (this.u) {
					Utils.title.setTitle({pre: preTitle + 'Лента фотографий - '});
				} else {
					Utils.title.setTitle({title: preTitle + 'Лента всех фотографий'});
				}
				if (this.page() === 1 && currPhotoLength && currPhotoLength <= this.limit) {
					needRecieve = false; //Если переключаемся на ленту с первой заполненной страницы, то оставляем её данные
				} else {
					this.photos([]);
				}
			} else {
				page = Math.abs(Number(page)) || 1;
				this.feed(false);
				this.scrollDeActivate();
				if (this.u) {
					Utils.title.setTitle({pre: preTitle + 'Фотографии - '});
				} else {
					Utils.title.setTitle({title: preTitle + 'Все фотографии'});
				}
				if (page === 1 && this.page() === 1 && currPhotoLength) {
					needRecieve = false; //Если переключаемся на страницы с ленты, то оставляем её данные для первой страницы
					if (currPhotoLength > this.limit) {
						this.photos.splice(this.limit);
					}
				}
			}
			this.page(page);

			if (!this.u) {
				ga('send', 'pageview'); //В галерее пользователя pageview отправляет userPage
			}

			if (needRecieve || filterChange) {
				this.getPhotos((page - 1) * this.limit, this.limit, function () {
					this.makeBinding();
				}, this);
			}
		},
		feedSelect: function (feed) {
			globalVM.router.navigateToUrl(this.pageUrl() + (feed ? '/feed' : ''));
		},
		scrollActivate: function () {
			if (!this.scrollActive) {
				$window.on('scroll', this.scrollHandler);
				this.scrollActive = true;
			}
		},
		scrollDeActivate: function () {
			if (this.scrollActive) {
				$window.off('scroll', this.scrollHandler);
				this.scrollActive = false;
			}
		},

		getNextPage: function () {
			if (!this.loading()) {
				this.getPhotos(this.photos().length, this.limit);
			}
		},
		getPhotos: function (skip, limit, cb, ctx) {
			this.loading(true);
			this.receivePhotos(skip, limit, function (data) {
				if (!data || data.error) {
					return;
				}
				this.count(data.count); //Вводим полное кол-во фотографий для пересчета пагинации
				if (this.page() > this.pageLast()) {
					//Если вызванная страница больше максимальной, выходим и навигируемся на максимальную
					return window.setTimeout(function () {
						globalVM.router.navigateToUrl(this.pageUrl() + '/' + this.pageLast());
					}.bind(this), 200);
				}

				if (this.feed()) {
					if (data.photos && data.photos.length) {
						this.photos.concat(data.photos, false);
					}
					if (this.scrollActive && limit > data.photos.length) {
						this.scrollDeActivate();
					}
				} else {
					this.photos(data.photos);
				}
				this.loading(false);

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}, this);
		},
		receivePhotos: function (skip, limit, cb, ctx) {
			var reqName = this.u ? 'giveUserPhotos' : 'givePhotosPublic',
				resName = this.u ? 'takeUserPhotos' : 'takePhotosPublic',
				params = {skip: skip, limit: limit};

			if (this.u) {
				params.login = this.u.login();
			}
			if (this.filter && !Utils.isObjectEmpty(this.filter)) {
				params.filter = this.filter;
			}

			socket.once(resName, function (data) {
				var i;
				if (!data || data.error || !Array.isArray(data.photos)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.skip === skip) {
					this.processPhotos(data.photos);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit(reqName, params);
		},
		receivePhotosPrivate: function (cb, ctx) {
			var params = {login: this.u.login(), startTime: this.photos().length > 0 ? _.last(this.photos()).sdate : undefined, endTime: undefined};

			socket.once('takeUserPhotosPrivate', function (data) {
				if (data && !data.error && data.len > 0) {
					var currArray = this.photos(),
						needSort,
						needReplacement;

					if (data.disabled && data.disabled.length) {
						this.processPhotos(data.disabled);
						Array.prototype.push.apply(currArray, data.disabled);
						needReplacement = needSort = true;
					}
					if (data.del && data.del.length) {
						this.processPhotos(data.del);
						Array.prototype.push.apply(currArray, data.del);
						needReplacement = needSort = true;
					}
					if (needSort) {
						currArray.sort(function (a, b) {
							return a.sdate < b.sdate ? 1 : (a.sdate > b.sdate ? -1 : 0);
						});
					}

					if (data.fresh && data.fresh.length) {
						this.processPhotos(data.fresh);
						Array.prototype.unshift.apply(currArray, data.fresh);
						needReplacement = true;
					}

					if (needReplacement) {
						this.photos(currArray);
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserPhotosPrivate', params);
		},
		processPhotos: function (arr) {
			for (var i = arr.length; i--;) {
				Photo.factory(arr[i], 'compact', 'h', {title: 'Без названия'});
			}
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
				marginMin = 8;
			} else if (windowW < 1441) {
				marginMin = 10;
			} else {
				marginMin = 14;
			}
			if (domW < 900) {
				thumbN = 4;
			} else if (domW < 1300) {
				thumbN = 5;
			} else if (domW < 1441) {
				thumbN = 6;
			} else {
				thumbN = 7;
			}

			thumbW = Math.min(domW / thumbN - marginMin - 4, thumbWMax) >> 0;
			if (thumbW < thumbWMin) {
				thumbN = domW / (thumbWMin + marginMin) >> 0;
				thumbW = Math.min(domW / thumbN - marginMin - 4, thumbWMax) >> 0;
			}
			thumbH = thumbW / 1.5 >> 0;
			//margin = ((domW % thumbW) / (domW / thumbW >> 0)) / 2 >> 0;

			//Ширина для центрируемого холста с превьюшками для переносов. 4 прибавляем, чтобы учесть возможную погрешность
			this.panelW((thumbN * (thumbW + marginMin + 2) + 4 >> 0) + 'px');
			this.w(thumbW + 'px');
			this.h(thumbH + 'px');
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
								this.processPhotos(data.photos);
								this.count(this.count() + data.photos.length);
								this.auth.setProps({pfcount: this.auth.iAm.pfcount() + data.photos.length});

								if (this.page() > 1) {
									//Если в постраничном режиме, не на первой странице, то переходим на первую
									globalVM.router.navigateToUrl(this.pageUrl());
								} else {
									//Если с учетом добавленных текущие вылезут за лимит страницы, удаляем текущие
									if (!this.feed() && this.photos().length + data.photos.length > this.limit) {
										this.photos.splice(this.limit - data.photos.length);
									}
									this.photos.concat(data.photos, true);
								}
							}
						}
					}.bind(this));
					socket.emit('givePhotosFresh', {login: this.u.login(), after: this.waitUploadSince});
				}

				delete this.uploadVM;
				delete this.waitUploadSince;
				globalVM.router.navigateToUrl('/u/' + this.u.login() + '/photo');
			}
		},

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
				content = imgFailTpl({style: 'margin-top:7px;', txt: '<span class="glyphicon glyphicon-road"></span><br>Превью скоро будет создано<br>пожалуйста, обновите позже'});
			} else {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: 'Превью недоступно'});
			}
			$photoBox.find('.curtain').after(content);
			parent.classList.add('showPrv');
		}
	});
});
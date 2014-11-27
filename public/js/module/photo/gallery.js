/**
 * Модель галереи фотографий
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'm/photo/status', 'lib/jsuri', 'text!tpl/photo/gallery.jade', 'css!style/photo/gallery'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, statuses, Uri, jade) {
	'use strict';
	var $window = $(window);
	var imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');
	var statusNums = statuses.nums;

	var filter_s = _.transform(statusNums, function (result, status, num) {
		result.push({s: num, title: status.filter_title});
	}, []);

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
			this._ = _;

			this.photos = ko.observableArray();
			this.feed = ko.observable(false);

			this.count = ko.observable(0);
			this.limit = 30; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
			this.loading = ko.observable(false);
			this.loadedFirst = ko.observable(false); //Говорит, что данные были загружены, хотя бы раз

			this.scrollActive = false;
			this.scrollHandler = function () {
				if ($window.scrollTop() >= $(document).height() - $window.height() - 140) {
					this.getNextFeedPhotos();
				}
			}.bind(this);

			this.itsMine = this.co.itsMine = ko.computed(function () {
				return this.u && this.auth.iAm && this.u.login() === this.auth.iAm.login();
			}, this);

			this.filter = {
				//Параметры фильтра для запросов
				origin: '',
				//Значения фильтра для отображения
				disp: {
					s: ko.observableArray(),
					r: ko.observableArray(),
					rdis: ko.observableArray(), //Массив cid неактивных регионов
					geo: ko.observableArray()
				},
				active: ko.observable(true),
				inactivateString: '',
				open: ko.observable(false),
				can: {
					s: this.co.filtercans = ko.computed(function () {
						return this.itsMine() || this.auth.iAm && this.auth.iAm.role() > 4;
					}, this)
				},
				available: {
					s: this.co.filteravailables = ko.computed(function () {
						if (this.auth.iAm) {
							// Владелец или модератор видят все статусы, можно регулировать
							if (this.auth.iAm.role() > 4 || this.itsMine()) {
								return filter_s;
							}
						}
						return [];
					}, this)
				}
			};
			this.subscriptions.filter_disp_r = this.filter.disp.r.subscribe(this.filterChangeHandle, this);
			this.subscriptions.filter_disp_s = this.filter.disp.s.subscribe(this.filterChangeHandle, this);
			this.subscriptions.filter_active = this.filter.active.subscribe(this.filterActiveChange, this);
			this.filterChangeHandleBlock = false;


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
				return this.options.addPossible && this.itsMine() && (this.feed() || this.page() === 1);
			}, this);

			this.subscriptions.login = this.u.login.subscribe(this.changeUserHandler, this); //Срабатывает при смене пользователя
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
		},
		loggedInHandler: function () {
			//После логина перезапрашиваем фотографии пользователя
			//В режиме ленты также перезапрашиваем всё, а не только приватные,
			//т.к. необходимо обновить по регионам пользователя
			this.refreshPhotos();
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
				page = params.page,
				filterString = params.f || '',
				filterChange = false,
				currPhotoLength = this.photos().length,
				needRecieve = true,
				preTitle = '';

			// Если сразу открываем загрузку, то обрабатываем галерею как обычный запуск, т.е. page будет 1
			// Если галерея уже загружена и затем открываем загрузку, то ничего делать не надо
			if (this.binded && params.photoUpload) {
				return;
			}

			// Если показывается окно загрузки, но в параметрах его нет,
			// значит мы вернулись из загрузки в галерею и должны загрузку просто закрыть
			if (this.uploadVM && !params.photoUpload) {
				this.destroyUpload();
				return;
			}

			//Переданные параметры фильтров
			if (filterString !== this.filter.origin && this.filter.active()) {
				this.filter.origin = filterString && filterString.length < 512 ? filterString : '';
				this.pageQuery(location.search);
				if (this.filter.origin && !this.loadedFirst()) {
					this.filter.open(true);
				}
				filterChange = true;
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
					Utils.title.setTitle({pre: preTitle + 'Галерея - '});
				} else {
					Utils.title.setTitle({title: preTitle + 'Галерея'});
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
				this.makeBinding();
				this.getPhotos((page - 1) * this.limit, this.limit, function () {
					this.loadedFirst(true);
				}, this);
			}
		},
		buildFilterString: function () {
			var filterString = '',
				r = this.filter.disp.r(),
				rp = this.filter.disp.rdis(),
				s = this.filter.disp.s(),
				geo = this.filter.disp.geo(),
				i;

			if (geo.length === 1) {
				filterString += (filterString ? '_' : '') + 'geo!' + geo[0];
			}
			if (r.length) {
				filterString += (filterString ? '_' : '') + 'r';
				for (i = 0; i < r.length; i++) {
					filterString += '!' + r[i].cid;
				}

				if (rp.length) {
					filterString += (filterString ? '_' : '') + 'rp';
					for (i = 0; i < rp.length; i++) {
						filterString += '!' + rp[i];
					}
				}
			} else {
				if (this.auth.iAm && this.auth.iAm.regions().length) {
					filterString += (filterString ? '_' : '') + 'r!0';
				}
			}
			if (s.length) {
				filterString += (filterString ? '_' : '') + 's';
				for (i = 0; i < s.length; i++) {
					filterString += '!' + s[i];
				}
			}

			return filterString;
		},
		filterActiveChange: function (val) {
			if (this.filterActiveChangeBlock) {
				return;
			}
			if (val) {
				this.filter.origin = this.filter.inactivateString;
				this.filter.inactivateString = '';
			} else if (!val) {
				this.filter.inactivateString = this.filter.origin;
				this.filter.origin = this.itsMine() ? '' : 'r!0'; //Своя галерея всегда отдается по всем по умолчанию
			}
			this.refreshPhotos();
		},
		filterChangeHandle: function () {
			if (this.filterChangeHandleBlock) {
				return;
			}
			//Если фильтр не активен, то "тихо" активируем, без рефреша
			if (!this.filter.active()) {
				this.filterActiveChangeBlock = true;
				this.filter.active(true);
				this.filterActiveChangeBlock = false;
			}
			var newFilter = this.buildFilterString();
			if (newFilter !== this.filter.origin) {
				this.updateFilterUrl(newFilter);
			}
		},
		//Делает активным в фильтре только один переданный регион
		fronly: function (cid) {
			if (this.loading()) {
				return false;
			}
			if (cid) {
				var diss = [];

				this.filter.disp.r().forEach(function (item) {
					if (item.cid !== cid) {
						diss.push(item.cid);
					}
				});
				this.filter.disp.rdis(diss);
				this.filterChangeHandle();
			}
		},
		//Активирует/деактивирует в фильтре переданный регион
		frdis: function (cid) {
			if (this.loading()) {
				return false;
			}
			if (cid) {
				var region = _.find(this.filter.disp.r(), function (item) {
					return item.cid === cid;
				}, this);
				if (region) {
					if (_.contains(this.filter.disp.rdis(), cid)) {
						this.filter.disp.rdis.remove(cid);
					} else {
						this.filter.disp.rdis.push(cid);
					}
					this.filterChangeHandle();
				}
			}
		},
		//Обработка клика вариантов присутствия координат в фильтре
		//Чтобы постаыить вторую галку, если обе сняты, т.к. должно быть хотя-бы одно из состояний
		fgeoclk: function (data, event) {
			var currDispGeo = data.filter.disp.geo(),
				clickedGeo = event.target.value;

			if (!currDispGeo.length) {
				//Если все варианты сняты, делаем активным второй вариант
				if (clickedGeo === '0') {
					data.filter.disp.geo(['1']);
				} else {
					data.filter.disp.geo(['0']);
				}
			}
			this.filterChangeHandle(); //Вручную вызываем обработку фильтра

			return true; //Возвращаем true, чтобы галка в браузере переключилась
		},
		updateFilterUrl: function (filterString) {
			var uri = new Uri(location.pathname + location.search);
			if (filterString) {
				uri.replaceQueryParam('f', filterString);
			} else {
				uri.deleteQueryParam('f');
			}
			globalVM.router.navigate(uri.toString());
		},

		feedSelect: function (feed) {
			globalVM.router.navigate(this.pageUrl() + (feed ? '/feed' : '') + this.pageQuery());
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

		refreshPhotos: function () {
			if (this.feed()) {
				//В режиме ленты перезапрашиваем всё
				this.getPhotos(0, Math.max(this.photos().length, this.limit), null, null, true);
			} else {
				//В постраничном режиме просто перезапрашиваем страницу
				this.getPhotos((this.page() - 1) * this.limit, this.limit);
			}
		},
		getNextFeedPhotos: function () {
			if (!this.loading()) {
				this.getPhotos(this.photos().length, this.limit);
			}
		},
		getPhotos: function (skip, limit, cb, ctx, forceReplace) {
			this.loading(true);
			this.receivePhotos(skip, limit, function (data) {
				if (!data || data.error) {
					return;
				}
				this.count(data.count); //Вводим полное кол-во фотографий для пересчета пагинации
				if (this.page() > this.pageLast()) {
					//Если вызванная страница больше максимальной, выходим и навигируемся на максимальную
					return window.setTimeout(function () {
						globalVM.router.navigate(this.pageUrl() + '/' + this.pageLast() + this.pageQuery());
					}.bind(this), 200);
				}

				if (this.feed()) {
					if (data.photos && data.photos.length) {
						if (forceReplace) {
							this.photos(data.photos);
						} else {
							this.photos.concat(data.photos, false);
						}
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
			var reqName = this.u ? 'giveUserPhotos' : 'givePhotos',
				resName = this.u ? 'takeUserPhotos' : 'takePhotos',
				params = {skip: skip, limit: limit, filter: this.filter.origin};

			if (this.u) {
				params.login = this.u.login();
			}

			socket.once(resName, function (data) {
				var rEquals;
				if (!data || data.error || !Array.isArray(data.photos)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else if (data.skip === skip) {
					this.processPhotos(data.photos, data.rhash);
					//Если фильтр активен - обновляем в нем данные
					if (this.filter.active()) {
						this.filterChangeHandleBlock = true;

						//Если количество регионов равно, они пусты или массивы их cid равны,
						//то и заменять их не надо, чтобы небыло "прыжка"
						rEquals = this.filter.disp.r().length === data.filter.r.length &&
							(!data.filter.r.length || _.isEqual(_.pluck(this.filter.disp.r(), 'cid'), _.pluck(data.filter.r, 'cid')));
						if (!rEquals) {
							this.filter.disp.r(data.filter.r || []);
						}
						this.filter.disp.rdis(data.filter.rp || []);
						this.filter.disp.s(data.filter.s ? data.filter.s.map(String) : []);
						if (!data.filter.geo || !data.filter.geo.length) {
							data.filter.geo = ['0', '1'];
						}
						this.filter.disp.geo(data.filter.geo);
						this.filterChangeHandleBlock = false;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}, this);
			socket.emit(reqName, params);
		},
		processPhotos: function (arr, regionsHash) {
			var photo, i = arr.length, j;
			while (i--) {
				photo = arr[i];
				Photo.factory(photo, 'compact', 'h', {title: 'Без названия'});
				if (regionsHash && photo.rs !== undefined) {
					for (j = photo.rs.length; j--;) {
						photo.rs[j] = regionsHash[photo.rs[j]];
					}
				}
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
								topic: 'Загрузка фотографий',
								initWidth: '1000px',
								offIcon: {text: 'Отмена', click: function () {
									this.closeUpload();
								}, ctx: this},
								btns: [
									{css: 'btn-success', text: 'Завершить', click: function () {
										this.uploadVM.createPhotos(function (data) {
											if (data && !data.error) {
												this.getAndCloseUpload(data.cids.length);
												ga('send', 'event', 'photo', 'create', 'photo create success', data.cids.length);
											} else {
												ga('send', 'event', 'photo', 'create', 'photo create error');
											}
										}, this);
									}, ctx: this},
									{css: 'btn-warning', text: 'Отмена', click: function () {
										this.closeUpload();
									}, ctx: this}
								]
							},
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
		getAndCloseUpload: function (newCount) {
			if (this.uploadVM) {
				if (newCount) {
					this.loading(true);
					socket.once('takePhotosFresh', function (data) {
						if (!data || data.error) {
							window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
						} else {
							if (data.photos.length > 0) {
								this.processPhotos(data.photos, data.rhash);
								this.count(this.count() + data.photos.length);
								this.auth.setProps({pfcount: this.auth.iAm.pfcount() + data.photos.length});

								if (this.page() > 1 || this.filter.origin) {
									//Если в постраничном режиме не на первой странице или активен фильтр,
									//то переходим на первую без фильтров
									globalVM.router.navigate(this.pageUrl());
								} else {
									//Если с учетом добавленных текущие вылезут за лимит страницы, удаляем текущие
									if (!this.feed() && this.photos().length + data.photos.length > this.limit) {
										this.photos.splice(this.limit - data.photos.length);
									}
									this.photos.concat(data.photos, true);
								}
							}
						}
						this.loading(false);
					}, this);
					socket.emit('givePhotosFresh', {login: this.u.login(), after: this.waitUploadSince});
				}
				this.closeUpload();
			}
		},
		closeUpload: function () {
			//Закрытие будет вызвано автоматиечски после срабатывания routeHandler
			globalVM.router.navigate(this.pageUrl() + (this.feed() ? '/feed' : (this.page() > 1 ? '/' + this.page() : '')) + this.pageQuery());
		},
		destroyUpload: function () {
			if (this.uploadVM) {
				this.uploadVM.destroy();
				delete this.uploadVM;
				delete this.waitUploadSince;
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
		},

		regionSelect: function () {
			if (!this.regselectVM) {
				renderer(
					[
						{
							module: 'm/region/select',
							options: {
								min: 0,
								max: 5,
								selectedInit: this.filter.disp.r()
							},
							modal: {
								topic: 'Выбор регионов для фильтрации',
								initWidth: '900px',
								maxWidthRatio: 0.95,
								fullHeight: true,
								withScroll: true,
								offIcon: {text: 'Отмена', click: this.closeRegionSelect, ctx: this},
								btns: [
									{css: 'btn-success', text: 'Применить', glyphicon: 'glyphicon-ok', click: function () {
										var regions = this.regselectVM.getSelectedRegions(['cid', 'title_local']);

										if (regions.length > 5) {
											window.noty({text: 'Допускается выбирать до 5 регионов', type: 'error', layout: 'center', timeout: 3000, force: true});
											return;
										}

										this.filter.disp.r(regions);
										this.closeRegionSelect();
									}, ctx: this},
									{css: 'btn-warning', text: 'Отмена', click: this.closeRegionSelect, ctx: this}
								]
							},
							callback: function (vm) {
								this.regselectVM = vm;
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
		closeRegionSelect: function () {
			if (this.regselectVM) {
				this.regselectVM.destroy();
				delete this.regselectVM;
			}
		}
	});
});
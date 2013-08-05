/*global define:true*/
/**
 * Модель нижней панели на главной
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/User', 'model/storage', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, User, storage, jade) {
	'use strict';

	var catsObj = {
			photosToApprove: {name: 'Ожидают подтверждения', tpl: 'photosTpl'},
			photos: {name: 'Новые фото', tpl: 'photosTpl'},
			photosNoGeo: {name: 'Где это?', tpl: 'photosTpl'},
			ratings: {name: 'Рейтинги', tpl: 'ratingsTpl'},
			stats: {name: 'Статистика', tpl: 'statsTpl'}
		},
		cats = [
			'photos',
			'photosNoGeo',
			'ratings',
			'stats'
		],
		catsMod = [
			'photosToApprove'
		],
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.news = ko.observableArray();

			this.catsObj = catsObj;
			this.cats = ko.observableArray(cats);
			if (this.auth.loggedIn() && this.auth.iAm.role() > 4 && catsMod.length) {
				this.cats.concat(catsMod, true);
				catsMod = []; //FIXME: Конкат изменяет исходный массив
			}
			this.catLoading = ko.observable('');
			this.catActive = ko.observable('');
			this.moreLink = ko.observable('');

			this.photos = ko.observableArray();
			this.ratings = {
				pbyview: {
					day: ko.observableArray(),
					week: ko.observableArray(),
					all: ko.observableArray(),
					selected: ko.observable('day')
				},
				pbycomm: {
					day: ko.observableArray(),
					week: ko.observableArray(),
					all: ko.observableArray(),
					selected: ko.observable('day')
				},
				ubycomm: {
					day: ko.observableArray(),
					week: ko.observableArray(),
					all: ko.observableArray(),
					selected: ko.observable('day')
				},
				ubyphoto: {
					day: ko.observableArray(),
					week: ko.observableArray(),
					all: ko.observableArray(),
					selected: ko.observable('day')
				}
			};
			this.stats = {
				all: {
					pallCount: 0,
					userCount: 0,
					photoYear: {},
					pdayCount: 0,
					pweekCount: 0
				}
			};

			this.catClickBind = this.catClick.bind(this);

			this.getNews();
			if (this.auth.iAm.role() > 4) {
				this.catJump('photosToApprove');
			} else {
				this.catJump('photos');
			}

			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			ko.applyBindings(globalVM, this.$dom[0]);
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

		loggedInHandler: function () {
			// После логина проверяем если мы можем добавить категории
			if (this.auth.iAm.role() > 4 && catsMod.length) {
				this.cats.concat(catsMod, true);
				catsMod = [];
				this.catJump('photosToApprove');
			}
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		catClick: function (data) {
			this.catJump(data);
		},
		catJump: function (id) {
			this.catLoading(id);
			this['get' + Utils.capitalizeFirst(id)](this.catActivate, this);
		},
		catActivate: function (success) {
			if (success) {
				this.catActive(this.catLoading());
			}
			this.catLoading('');
		},
		getNews: function (cb, ctx) {
			socket.once('takeIndexNews', function (data) {
				var success = false;
				if (!data || data.error || !Array.isArray(data.news)) {
					console.log('Index news error', data && data.message);
				} else {
					for (var i = data.news.length; i--;) {
						data.news.ccount = data.news.ccount || 0;
						if (data.news[i].notice) {
							data.news[i].expand = true;
						} else {
							data.news[i].notice = data.news[i].txt;
						}
					}
					this.news(data.news);
					success = true;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('giveIndexNews');
		},
		getPhotos: function (cb, ctx) {
			socket.once('takePhotosPublicIndex', function (data) {
				var success = false;
				if (this.catLoading() === 'photos') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('/ps');
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('givePhotosPublicIndex');
		},
		getPhotosNoGeo: function (cb, ctx) {
			socket.once('takePhotosPublicNoGeoIndex', function (data) {
				var success = false;
				if (this.catLoading() === 'photosNoGeo') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('/ps?f=nogeo');
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('givePhotosPublicNoGeoIndex');
		},
		getPhotosToApprove: function (cb, ctx) {
			socket.once('takePhotosForApprove', function (data) {
				var success = false;
				if (this.catLoading() === 'photosToApprove') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('');
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('givePhotosForApprove', {skip: 0, limit: 30});
		},
		getRatings: function (cb, ctx) {
			var success = false;
			socket.once('takeRatings', function (data) {
				if (this.catLoading() === 'ratings') {
					if (!data || data.error) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.ratings.pbyview.day(this.processPhotos(data.pday, Photo.picFormats.s, 'vdcount', [' просмотр', ' просмотра', ' просмотров']));
						this.ratings.pbyview.week(this.processPhotos(data.pweek, Photo.picFormats.s, 'vwcount', [' просмотр', ' просмотра', ' просмотров']));
						this.ratings.pbyview.all(this.processPhotos(data.pall, Photo.picFormats.s, 'vcount', [' просмотр', ' просмотра', ' просмотров']));

						this.ratings.pbycomm.day(this.processPhotos(data.pcday, Photo.picFormats.s, 'ccount', [' комментарий', ' комментария', ' комментариев']));
						this.ratings.pbycomm.week(this.processPhotos(data.pcweek, Photo.picFormats.s, 'ccount', [' комментарий', ' комментария', ' комментариев']));
						this.ratings.pbycomm.all(this.processPhotos(data.pcall, Photo.picFormats.s, 'ccount', [' комментарий', ' комментария', ' комментариев']));

						this.ratings.ubycomm.day(this.processUsers(data.ucday, 'comments', 'ccount', [' комментарий', ' комментария', ' комментариев']));
						this.ratings.ubycomm.week(this.processUsers(data.ucweek, 'comments', 'ccount', [' комментарий', ' комментария', ' комментариев']));
						this.ratings.ubycomm.all(this.processUsers(data.ucall, 'comments', 'ccount', [' комментарий', ' комментария', ' комментариев']));

						this.ratings.ubyphoto.day(this.processUsers(data.upday, 'photo', 'pcount', [' фотография', ' фотографии', ' фотографий']));
						this.ratings.ubyphoto.week(this.processUsers(data.upweek, 'photo', 'pcount', [' фотография', ' фотографии', ' фотографий']));
						this.ratings.ubyphoto.all(this.processUsers(data.upall, 'photo', 'pcount', [' фотография', ' фотографии', ' фотографий']));
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('giveRatings', {limit: 24});
		},
		getStats: function (cb, ctx) {
			var success = false;
			socket.once('takeStats', function (data) {
				if (this.catLoading() === 'stats') {
					if (!data || data.error || !data.all) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.stats.all = data.all;
					}
					success = true;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success);
				}
			}.bind(this));
			socket.emit('giveStats');
		},

		ratSelect: function (data, event) {
			var group = $(event.target).parents('.btn-group').attr('id'),
				id = $(event.target).attr('data-time');
			this.ratings[group].selected(id);
		},
		processPhotos: function (photos, picFormat, numField, numFormat) {
			var i = photos.length,
				photo;
			while (i) {
				photo = photos[--i];
				if (P.preaddrs.length > 1) {
					photo.sfile = P.preaddrs[i % P.preaddrs.length] + picFormat + photo.file;
				} else {
					photo.sfile = P.preaddr + picFormat + photo.file;
				}
				photo.link = '/p/' + photo.cid;
				if (!photo.title) {
					photo.title = 'Без названия';
				}
				if (numField && numFormat) {
					photo.amount = photo[numField] + Utils.format.wordEndOfNum(photo[numField], numFormat);
				}
			}
			return photos;
		},
		processUsers: function (users, linkSection, numField, numFormat) {
			var i = users.length,
				user;
			while (i) {
				user = users[--i];
				if (user.avatar) {
					user.sfile = P.preaddr + '/_a/d/' + user.avatar;
				} else {
					user.sfile = User.def.full.avatar;
				}
				user.link = '/u/' + user.login + (linkSection ? '/' + linkSection : '');
				user.title = user.disp;
				if (numField && numFormat) {
					user.amount = user[numField] + Utils.format.wordEndOfNum(user[numField], numFormat);
				}
			}
			return users;
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
				content = imgFailTpl({style: 'margin-top:7px;', txt: '<i class="icon-white icon-road"></i><br>Превью скоро будет создано<br>пожалуйста, обновите позже'});
			} else {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: 'Превью недоступно'});
			}
			$photoBox.append(content);
			parent.classList.add('showPrv');
		},

		onImgLoad: function (data, event) {
			event.target.parentNode.classList.add('showPrv');
		},
		onImgErr: function (data, event) {
			event.target.parentNode.classList.add('fail'); //Через запятую работает пока только в chrome
			event.target.parentNode.classList.add('showPrv');
		}
	});
});
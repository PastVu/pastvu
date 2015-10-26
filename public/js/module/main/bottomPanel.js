/**
 * Модель нижней панели на главной
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/User', 'model/storage', 'm/photo/status', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, User, storage, statuses, jade) {
	'use strict';

	var catsObj = {
			photosToApprove: {name: 'Awaiting confirmation', tpl: 'photosTpl'},
			photos: {name: 'New photos', tpl: 'photosTpl'},
			photosNoGeo: {name: 'Where is it?', tpl: 'photosTpl'},
			ratings: {name: 'Rating', tpl: 'ratingsTpl'},
			stats: {name: 'Statistic', tpl: 'statsTpl'}
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
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>'),
		declension = {
			user: [' user'],
			reg: [' registerd'],
			photo: [' photo'],
			comment: [' comment'],
			view: [' view']
		};

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
					pweekCount: 0,
					callCount: 0,
					cdayCount: 0,
					cweekCount: 0
				},
				common: {
					onall: 0,
					onreg: 0
				}
			};

			this.catClickBind = this.catClick.bind(this);

			if (this.auth.iAm.role() > 4) {
				this.catJump('photosToApprove');
			} else {
				this.catJump('photos');
			}

			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			//Байндимся и показываемся только после запроса новостей, чтобы избежать "прыжка" после их загрузки
			this.getNews(function () {
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

		loggedInHandler: function () {
			if (this.auth.iAm.role() > 4 && catsMod.length) {
				//Если пользователь модератор, добавляем галерею на подтверждение и переключаемся на нее
				this.cats.concat(catsMod, true);
				catsMod = [];
				this.catJump('photosToApprove');
			} else if (this.catActive() === 'photos' || this.catActive() === 'photosNoGeo') {
				//Если перезагружаем текущую категорию
				this.catJump(this.catActive());
			}

			//Перезапрашиваем новости на главной, чтобы увидеть новые комментарии или убрать скрытые пользователем новости
			this.getNews();

			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		catClick: function (data) {
			this.catJump(data, true);
		},
		catJump: function (id, scroll) {
			this.catLoading(id);
			this['get' + Utils.capitalizeFirst(id)](this.catActivate, this, scroll);
		},
		catActivate: function (success, scroll) {
			if (success) {
				if (scroll) {
					var $catMenu = this.$dom.find('.catMenu'),
						catContentHeight = this.$dom.find('.catContent').height(),
						cBottom = $catMenu.offset().top + $catMenu.height() + 60,
						wTop = $(window).scrollTop(),
						wFold = $(window).height() + wTop;

					if (wFold < cBottom) {
						$(window).scrollTo('+=' + (cBottom - wFold + catContentHeight / 2 >> 0) + 'px', {axis: 'y', duration: 200, onAfter: function () {
							this.catSetLoading();
						}.bind(this)});
					} else {
						this.catSetLoading();
					}
				} else {
					this.catSetLoading();
				}
			} else {
				this.catLoading('');
			}
		},
		catSetLoading: function (success, scroll) {
			this.catActive(this.catLoading());
			this.catLoading('');
		},
		getNews: function (cb, ctx, scroll) {
			socket.once('takeIndexNews', function (data) {
				var success = false;
				if (!data || data.error || !Array.isArray(data.news)) {
					console.log('Index news error', data && data.message);
				} else {
					for (var i = data.news.length; i--;) {
						data.news.ccount = data.news.ccount || 0;
						data.news.ccount_new = data.news.ccount_new || 0;
						if (data.news[i].notice) {
							data.news[i].expand = true;
						} else {
							data.news[i].notice = data.news[i].txt;
						}
					}
					this.news(data.news);
					success = true;
				}
				if (_.isFunction(cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('giveIndexNews');
		},
		getPhotos: function (cb, ctx, scroll) {
			socket.once('takePhotosPublicIndex', function (data) {
				var success = false;
				if (this.catLoading() === 'photos') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, data.rhash, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('/ps/2');
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('givePhotosPublicIndex');
		},
		getPhotosNoGeo: function (cb, ctx, scroll) {
			socket.once('takePhotosPublicNoGeoIndex', function (data) {
				var success = false;
				if (this.catLoading() === 'photosNoGeo') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, data.rhash, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('/ps/2?f=geo!0');
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('givePhotosPublicNoGeoIndex');
		},
		getPhotosToApprove: function (cb, ctx, scroll) {
			socket.once('takePhotosForApprove', function (data) {
				var success = false;
				if (this.catLoading() === 'photosToApprove') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, data.rhash, Photo.picFormats.m);
						this.photos(data.photos);
						this.moreLink('/ps/2?f=r!0_s!' + statuses.keys.READY);
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('givePhotosForApprove', {skip: 0, limit: 42});
		},
		getRatings: function (cb, ctx, scroll) {
			var success = false;
			socket.once('takeRatings', function (data) {
				if (this.catLoading() === 'ratings') {
					if (!data || data.error) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.ratings.pbyview.day(this.processPhotos(data.pday, data.rhash, Photo.picFormats.s, 'vdcount', declension.view));
						this.ratings.pbyview.week(this.processPhotos(data.pweek, data.rhash, Photo.picFormats.s, 'vwcount', declension.view));
						this.ratings.pbyview.all(this.processPhotos(data.pall, data.rhash, Photo.picFormats.s, 'vcount', declension.view));

						this.ratings.pbycomm.day(this.processPhotos(data.pcday, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));
						this.ratings.pbycomm.week(this.processPhotos(data.pcweek, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));
						this.ratings.pbycomm.all(this.processPhotos(data.pcall, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));

						this.ratings.ubycomm.day(this.processUsers(data.ucday, 'comments', 'ccount', declension.comment));
						this.ratings.ubycomm.week(this.processUsers(data.ucweek, 'comments', 'ccount', declension.comment));
						this.ratings.ubycomm.all(this.processUsers(data.ucall, 'comments', 'ccount', declension.comment));

						this.ratings.ubyphoto.day(this.processUsers(data.upday, 'photo', 'pcount', declension.photo));
						this.ratings.ubyphoto.week(this.processUsers(data.upweek, 'photo', 'pcount', declension.photo));
						this.ratings.ubyphoto.all(this.processUsers(data.upall, 'photo', 'pcount', declension.photo));
						success = true;
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('giveRatings', {limit: 24});
		},
		getStats: function (cb, ctx, scroll) {
			var success = false;
			socket.once('takeStats', function (data) {
				if (this.catLoading() === 'stats') {
					if (!data || data.error || !data.all) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.stats.all = data.all;
						this.stats.common = data.common;
						this.stats.common.onlineTxt = 'Now ' + data.common.onall + declension.user + (data.common.onall > 1 ? 's' : '') + ' is online, ' + data.common.onreg + ' of them are registered';
					}
					success = true;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, success, scroll);
				}
			}, this);
			socket.emit('giveStats');
		},

		ratSelect: function (data, event) {
			var group = $(event.target).parents('.btn-group').attr('id');
			var id = $(event.target).attr('data-time');
			this.ratings[group].selected(id);
		},
		processPhotos: function (photos, regionsHash, picFormat, numField, numFormat) {
			var photo;
            var j;

			for (var i = photos.length; i--;) {
				photo = photos[i];

				if (P.preaddrs.length > 1) {
					photo.sfile = P.preaddrs[i % P.preaddrs.length] + picFormat + photo.file;
				} else {
					photo.sfile = P.preaddr + picFormat + photo.file;
				}

				photo.link = '/p/' + photo.cid;

				if (!photo.title) {
					photo.title = 'Without title';
				}
				if (numField && numFormat) {
                    var amount = photo[numField];
					photo.amount = amount + numFormat[0] + (amount > 1 ? 's' : '');
				}
				if (regionsHash && photo.rs !== undefined) {
					for (j = photo.rs.length; j--;) {
						photo.rs[j] = regionsHash[photo.rs[j]];
					}
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
                    var amount = user[numField];
                    user.amount = amount + numFormat[0] + (amount > 1 ? 's' : '');
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
				content = imgFailTpl({style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;', txt: 'Preview is creating <br>please update later'});
			} else if (data.convqueue) {
				content = imgFailTpl({style: 'margin-top:7px;', txt: '<span class="glyphicon glyphicon-road"></span><br>Preview will be created soon'});
			} else {
				content = imgFailTpl({style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: 'Preview is unavailable'});
			}
			$photoBox.append(content);
			parent.classList.add('showPrv');
		}
	});
});
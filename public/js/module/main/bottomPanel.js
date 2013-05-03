/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/storage', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
	'use strict';
	var cats = [
		{id: 'photos', name: 'Новые фото'},
		{id: 'ratings', name: 'Рейтинги'},
		{id: 'stats', name: 'Статистика'}
	];

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.loadingCat = ko.observable(true);
			this.cats = ko.observableArray(cats);
			this.catActive = ko.observable('');

			this.photos = ko.observableArray();
			this.ratings = {
				byview: {
					pday: ko.observableArray(),
					pweek: ko.observableArray(),
					pall: ko.observableArray(),
					selected: ko.observable('pday')
				}
			};

			this.catClickBind = this.catClick.bind(this);

			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			this.catActivate('ratings');
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
			// После логина приверяем если мы можем добавить категории
			this.cats.unshift({id: 'photosToApprove', name: 'Ожидают подтверждения'});
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		catClick: function (data) {
			this.catActivate(data.id);
		},
		catActivate: function (id) {
			this.catActive(id);

			switch (id) {
			case 'photos':
				this.getPhotos();
				break;
			case 'ratings':
				this.getRatings();
				break;
			}
		},
		getPhotos: function (cb, ctx) {
			this.loadingCat(true);
			socket.once('takePhotosNew', function (data) {
				if (this.catActive() === 'photos') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.processPhotos(data.photos, Photo.picFormats.midi);
						this.photos(data.photos);
					}
					this.loadingCat(false);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('givePhotosNew', {limit: 24});
		},
		getRatings: function (cb, ctx) {
			this.loadingCat(true);
			socket.once('takeRatings', function (data) {
				if (this.catActive() === 'ratings') {
					if (!data || data.error) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						this.ratings.byview.pday(this.processPhotos(data.pday, Photo.picFormats.micro, 'stats_day', [' просмотр', ' просмотра', ' просмотров']));
						this.ratings.byview.pweek(this.processPhotos(data.pweek, Photo.picFormats.micro, 'stats_week', [' просмотр', ' просмотра', ' просмотров']));
						this.ratings.byview.pall(this.processPhotos(data.pall, Photo.picFormats.micro, 'stats_all', [' просмотр', ' просмотра', ' просмотров']));
					}
					this.loadingCat(false);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveRatings', {limit: 24});
		},
		ratSelect: function (data, event) {
			var group = $(event.target).parents('.btn-group').attr('id'),
				id = $(event.target).attr('id');
			this.ratings[group].selected(id);
		},
		processPhotos: function (photos, picFormat, numField, numFormat) {
			var i = photos.length,
				photo;
			while (i) {
				photo = photos[--i];
				photo.sfile = picFormat + photo.file;
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
		onThumbLoad: function (data, event) {
			var photoThumb = event.target.parentNode.parentNode;
			photoThumb.style.opacity = 1;
			data = event = photoThumb = null;
		},
		onThumbError: function (data, event) {
			var photoThumb = event.target.parentNode.parentNode;
			event.target.style.visibility = 'hidden';
			photoThumb.classList.add('photoError');
			photoThumb.style.opacity = 1;
			data = event = photoThumb = null;
		}
	});
});
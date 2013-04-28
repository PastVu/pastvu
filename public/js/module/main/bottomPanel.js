/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'm/storage', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
	'use strict';
	var cats = [
			{id: 'photos', name: 'Новые фото'},
			{id: 'raits', name: 'Рейтинги'},
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

			this.catClickBind = this.catClick.bind(this);

			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			this.catActivate('photos');
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
			if (id === 'photos') {
				this.getPhotos();
			}
		},
		getPhotos: function (cb, ctx) {
			this.loadingCat(true);
			socket.once('takePhotosNew', function (data) {
				var photo,
					i;
				if (this.catActive() === 'photos') {
					if (!data || data.error || !Array.isArray(data.photos)) {
						window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						i = data.photos.length;
						while (i) {
							photo = data.photos[--i];
							photo.sfile = Photo.picFormats.midi + photo.file;
							photo.link = '/p/' + photo.cid;
							photo.time = '(' + photo.year + (photo.year2 && photo.year2 !== photo.year ? '-' + photo.year2 : '') + ')';
							photo.name = photo.title + ' <span class="photoYear">' + photo.time + '</span>';
						}
						this.photos(data.photos);
					}
					this.loadingCat(false);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('givePhotosNew', {limit: 20});
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
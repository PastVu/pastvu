/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'm/storage', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/auth'];
			this.loadingCat = ko.observable('true');
			this.cats = ko.observableArray();
			this.catActive = ko.observable('photos');

			this.catClickBind = this.catClick.bind(this);

			var user = globalVM.router.params().user || this.auth.iAm.login();
			storage.user(user, function (data) {
				if (data) {
					this.user = data.vm;

					this.cats.push({id: 'photos', name: 'Новые фото'});
					this.cats.push({id: 'raits', name: 'Рейтинги'});
					this.cats.push({id: 'stats', name: 'Статистика'});

					ko.applyBindings(globalVM, this.$dom[0]);

					this.show();
				}
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
		catClick: function (data, event) {
			this.catActive(data.id);
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
			socket.emit('givePhotosNew', {});
		}
	});
});
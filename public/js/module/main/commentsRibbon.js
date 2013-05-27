/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'text!tpl/main/commentsRibbon.jade', 'css!style/main/commentsRibbon'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.comments = ko.observableArray();
			this.commentsPhotos = {};

			socket.once('takeCommentsRibbon', function (data) {
				var photo,
					comment,
					i;
				if (!data || data.error || !Array.isArray(data.comments)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					for (i in data.photos) {
						if (data.photos[i] !== undefined) {
							photo = data.photos[i];
							photo.sfile = Photo.picFormats.micro + photo.file;
							photo.link = '/p/' + photo.cid;
						}
					}
					this.commentsPhotos = data.photos;

					i = data.comments.length;
					while (i) {
						comment = data.comments[--i];
						comment.link = this.commentsPhotos[comment.obj].link + '?hl=comment-' + comment.cid;
					}
					this.comments(data.comments);
				}
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}.bind(this));
			socket.emit('giveCommentsRibbon', {limit: 20});
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		onAvatarLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
			data = event = null;
		},
		onAvatarError: function (data, event) {
			$(event.target).attr('src', '/img/caps/avatar.png');
			data = event = null;
		}
	});
});
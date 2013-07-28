/*global define:true*/
/**
 * Модель ленты последних комментариев
 */
define(['underscore', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'text!tpl/main/commentsFeed.jade', 'css!style/main/commentsFeed'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.comments = ko.observableArray();
			this.commentsPhotos = {};

			socket.once('takeCommentsFeed', function (data) {
				var photo,
					user,
					comment,
					commentsPhoto,
					commentsToInsert = [],
					i;
				if (!data || data.error || !Array.isArray(data.comments)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					for (i in data.photos) {
						if (data.photos[i] !== undefined) {
							photo = data.photos[i];
							photo.link = '/p/' + photo.cid;
							if (P.preaddrs.length) {
								photo.sfile = P.preaddrs[i % P.preaddrs.length] + Photo.picFormats.s + photo.file;
							} else {
								photo.sfile = Photo.picFormats.s + photo.file;
							}
						}
					}
					this.commentsPhotos = data.photos;

					for (i in data.users) {
						if (data.users[i] !== undefined) {
							user = data.users[i];
							user.link = '/u/' + user.login;
						}
					}
					this.commentsUsers = data.users;

					for (i = data.comments.length; i--;) {
						comment = data.comments[i];
						photo = this.commentsPhotos[comment.obj];
						user = this.commentsUsers[comment.user];
						if (photo && user) {
							comment.user = user;
							comment.link = photo.link + '?hl=comment-' + comment.cid;
							if (commentsPhoto && photo.cid === commentsPhoto.obj.cid) {
								commentsPhoto.comments.push(comment);
							} else {
								commentsPhoto = {
									obj: photo,
									comments: [comment]
								};
								commentsToInsert.unshift(commentsPhoto);
							}
						}
					}
					this.comments(commentsToInsert);
				}
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}.bind(this));
			socket.emit('giveCommentsFeed', {limit: 30});
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		onPreviewLoad: function (data, event) {
			event.target.parentNode.classList.add('showPrv');
		},
		onPreviewErr: function (data, event) {
			event.target.parentNode.classList.add('fail'); //Через запятую работает пока только в chrome
			event.target.parentNode.classList.add('showPrv');
		}
	});
});
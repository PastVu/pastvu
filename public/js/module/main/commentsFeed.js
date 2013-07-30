/*global define:true*/
/**
 * Модель ленты последних комментариев
 */
define(['underscore', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'text!tpl/main/commentsFeed.jade', 'css!style/main/commentsFeed'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.pComments = ko.observableArray();

			socket.once('takeCommentsFeed', function (data) {
				var photo,
					user,
					comment,
					photoCommentsToInsert = [],
					i;

				if (!data || data.error || !Array.isArray(data.comments)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					for (i in data.users) {
						if (data.users[i] !== undefined) {
							user = data.users[i];
							user.link = '/u/' + user.login;
						}
					}

					for (i = 0; i < data.comments.length; i++) {
						comment = data.comments[i];
						photo = data.photos[comment.obj];
						user = data.users[comment.user];
						if (photo && user) {
							comment.user = user;
							if (photo.comments === undefined) {
								photo.link = '/p/' + photo.cid;
								photo.sfile = (P.preaddrs.length ? P.preaddrs[i % P.preaddrs.length] : '') + Photo.picFormats.s + photo.file;
								photo.comments = [];
								photoCommentsToInsert.push(photo);
							}
							comment.link = photo.link + '?hl=comment-' + comment.cid;
							photo.comments.unshift(comment);
						}
					}
					this.pComments(photoCommentsToInsert);
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
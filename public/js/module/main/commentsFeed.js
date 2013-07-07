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
					comment,
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

					i = data.comments.length;
					while (i) {
						comment = data.comments[--i];
						if (this.commentsPhotos[comment.obj] !== undefined) {
							comment.link = this.commentsPhotos[comment.obj].link + '?hl=comment-' + comment.cid;
							commentsToInsert.unshift(comment);
						}
					}
					this.comments(commentsToInsert);
				}
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}.bind(this));
			socket.emit('giveCommentsFeed', {limit: 20});
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
			data = event = null;
		},
		onPreviewErr: function (data, event) {
			var $parent = $(event.target.parentNode);

			event.target.style.visibility = 'hidden';
			$parent.append('<div class="imgFail"><i class="icon-white icon-ban-circle"></i></div>');
			$parent[0].classList.add('showPrv');
		}
	});
});
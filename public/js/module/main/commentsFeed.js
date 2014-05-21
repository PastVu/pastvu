/*global define:true*/
/**
 * Модель ленты последних комментариев
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'lib/doT', 'text!tpl/main/commentsFeed.jade', 'css!style/main/commentsFeed'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, doT, html) {
	'use strict';

	var tplComments,
		regexpAHrefTag = /<(?:\s*)?\/?(?:\s*)?a[^>]*>/g,
		regexpNewLine = /[\f\r\n]/g;

	return Cliche.extend({
		jade: html,
		create: function () {
			this.pComments = [];
			ko.applyBindings(globalVM, this.$dom[0]);

			socket.once('takeCommentsFeed', function (data) {
				var photo,
					user,
					comment,
					regions,
					photoCommentsToInsert = [],
					i, j;

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

						//Убираем тэги ссылок (т.к. всё сообщение у нас ссылка, а ссылки в ссылках не разрешены)
						//и заменяем перенос строки на пробел в каждом сообщении
						comment.txt = comment.txt.replace(regexpAHrefTag, '').replace(regexpNewLine, ' ');

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

					regions = data.regions;
					if (regions) {
						for (i = photoCommentsToInsert.length; i--;) {
							photo = photoCommentsToInsert[i];
							if (photo.rs) {
								for (j = photo.rs.length; j--;) {
									photo.rs[j] = regions[photo.rs[j]];
								}
							}
						}
					}
					if (!tplComments) {
						tplComments = doT.template(document.getElementById('cfeeddot').text);
					}

					this.$dom[0].querySelector('.commentsBody').innerHTML = tplComments(photoCommentsToInsert);
					this.pComments = photoCommentsToInsert;
				}
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
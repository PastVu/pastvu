/*global define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'socket', 'globalVM', 'model/User', 'model/Photo'], function ($, _, ko, ko_mapping, Utils, socket, globalVM, User, Photo) {
	'use strict';

	var auth = globalVM.repository['m/common/auth'],
		storage = {
		users: {},
		photos: {},
		waitings: {},
		user: function (login, callback, context) {
			if (storage.users[login]) {
				callback.call(context, storage.users[login]);
			} else if (storage.waitings['u' + login]) {
				storage.waitings['u' + login].push({cb: callback, ctx: context});
			} else {
				storage.waitings['u' + login] = [
					{cb: callback, ctx: context}
				];
				socket.once('takeUser', function (data) {
					if (!data.error && data.login === login) {
						User.factory(data, 'full');
						storage.users[login] = {origin: data, vm: User.vm(data, undefined, true)};
					}
					if (storage.waitings['u' + login]) {
						storage.waitings['u' + login].forEach(function (item) {
							item.cb.call(item.ctx, !data.error && data.login === login && storage.users[login]);
						});
						delete storage.waitings['u' + login];
					}
				});
				socket.emit('giveUser', {login: login});
			}
		},
		userImmediate: function (login) {
			return storage.users[login];
		},
		photo: function (cid, callback, context) {
			if (storage.photos[cid]) {
				callback.call(context, storage.photos[cid]);
			} else if (storage.waitings['p' + cid]) {
				storage.waitings['p' + cid].push({cb: callback, ctx: context});
			} else {
				storage.waitings['p' + cid] = [
					{cb: callback, ctx: context}
				];
				socket.once('takePhoto', function (data) {
					if (!data.error && data.cid === cid) {
						Photo.factory(data, 'full', 'd');
						storage.photos[cid] = {vm: Photo.vm(data, undefined, true), origin: data, can: data.can || {}};
					}
					if (storage.waitings['p' + cid]) {
						storage.waitings['p' + cid].forEach(function (item) {
							item.cb.call(item.ctx, !data.error && storage.photos[cid]);
						});
						delete storage.waitings['p' + cid];
					}
				});
				socket.emit('givePhoto', {cid: cid, checkCan: auth.loggedIn()});
			}
		}
	};

	return storage;
});
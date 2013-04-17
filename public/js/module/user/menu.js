/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/user/menu.jade', 'css!style/user/menu'], function (_, P, ko, Cliche, globalVM, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/auth'];
			this.links = ko.observableArray();
			var user = globalVM.router.params().user || this.auth.iAm.login();

			storage.user(user, function (data) {
				if (data) {
					this.user = data.vm;

					this.links.push({name: 'Profile', href: "/u/" + this.user.login(), handler: 'profile'});
					this.links.push({name: 'Photos', href: "/u/" + this.user.login() + "/photo", handler: 'gallery'});
					if (P.settings.LoggedIn() && (this.auth.iAm.login() === this.user.login())) {
						this.links.push({name: 'Upload', href: "/u/photoUpload", handler: 'photoUpload'});
					}
					//this.links.push({name: 'Blogs', href: "/u/" + this.user.login() + "/blogs", disable: true});
					this.links.push({name: 'Comments', href: "/u/" + this.user.login() + "/comments/", handler: 'comments'});
					if (P.settings.LoggedIn() && (this.auth.iAm.login() === this.user.login())) {
						this.links.push({name: 'Settings', href: "/u/" + this.user.login() + "/settings", handler: 'settings'});
						this.links.push({name: 'Messages', href: "/u/" + this.user.login() + '/pm', disable: true, handler: 'pm'});
					}


					globalVM.router.routeChanged.subscribe(this.routeHandler, this);
					this.routeHandler();

					ko.applyBindings(globalVM, this.$dom[0]);

					this.show();
				}
			}, this);

		},
		show: function () {
			this.showing = true;
		},
		hide: function () {
			this.showing = false;
		},
		routeHandler: function () {
			var route = globalVM.router.root + globalVM.router.body(),
				links = this.links();

			links.forEach(function (item, index, array) {
				if (item.handler === globalVM.router.params()._handler) {
					item.active = true;
				} else {
					item.active = false;
				}
			}, this);

			this.links([]);
			this.links(links);
		}
	});
});
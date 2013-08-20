/*global define:true, ga:true*/
/**
 * Модель О проекте
 */
define(['underscore', 'Params', 'socket!', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/diff/about.jade', 'css!style/diff/about'], function (_, P, socket, ko, Cliche, globalVM, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.show();
		},
		show: function () {
			socket.once('takeAbout', function (result) {
				this.avatars = result || {};

				ko.applyBindings(globalVM, this.$dom[0]);
				globalVM.func.showContainer(this.$container);
				this.showing = true;

				ga('send', 'event', 'about', 'open', 'about open');
				//ga('send', 'pageview', {'page': '/about', 'title': 'О проекте'});
			}.bind(this));
			socket.emit('giveAbout');
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		}
	});
});
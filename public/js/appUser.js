/*global requirejs:true, require:true, define:true*/
require([
	'domReady!',
	'jquery',
	'Browser', 'Utils',
	'socket',
	'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
	'Params', 'globalVM', 'RouteManager', 'renderer', 'text!tpl/appUser.jade', 'css!style/appUser', 'backbone.queryparams', 'bs/bootstrap-transition', 'knockout.extends', 'noty', 'noty.layouts/center', 'noty.themes/oldmos'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, P, globalVM, RouteManager, renderer, index_jade) {
	"use strict";
	var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
		routeDFD = $.Deferred(),
		auth;

	$('body').append(index_jade);
	ko.applyBindings(globalVM);

	globalVM.router = new RouteManager(routerDeclare(), routeDFD);

	$.when(loadParams(), routeDFD.promise())
		.then(app);

	function loadParams() {
		var dfd = $.Deferred();
		socket.once('takeGlobeParams', function (data) {
			ko_mapping.fromJS({settings: data}, P);
			dfd.resolve();
		});
		socket.emit('giveGlobeParams');
		return dfd.promise();
	}

	function app() {
		auth = globalVM.repository['m/auth'];
		Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
	}

	function routerDeclare() {
		return {
			root: '/u/',
			routes: [
				{route: "", handler: "profile"},
				{route: ":user", handler: "profile"},
				{route: ":user/settings", handler: "settings"},
				{route: "photoUpload", handler: "photoUpload"},
				{route: ":user/photo", handler: "gallery"},
				{route: "clusterCalc", handler: "clusterCalc"},
				{route: "conveyer", handler: "conveyer"}
			],
			handlers: {
				profile: function (user, params) {
					console.log('User Profile');
					this.params({user: user || ""});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/user/profile', container: '#user_content'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, profile, news) {
							}
						}
					);
				},
				settings: function (user, params) {
					console.log('User Settings');
					this.params({user: user || ""});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/user/settings', container: '#user_content'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, settings, news) {
							}
						}
					);
				},

				photoUpload: function (params) {
					console.log('User Photo Upload');
					this.params({user: auth.iAm.login() || ""});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/user/photoUpload', container: '#user_content'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, photoUpload, news) {
							}
						}
					);
				},

				clusterCalc: function (params) {
					console.log('clusterCalc');
					this.params({});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/map/mapClusterCalc', container: '#user_content'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, photoUpload, news) {
							}
						}
					);
				},

				conveyer: function (params) {
					console.log('conveyer');
					this.params({});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/admin/conveyer', container: '#user_content'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, photoUpload, news) {
							}
						}
					);
				},

				gallery: function (user, params) {
					console.log('User gallery');
					this.params({user: user || ""});

					renderer(
						[
							{module: 'm/top', container: '#top_container'},
							{module: 'm/user/brief', container: '#user_brief', options: {affix: true}},
							{module: 'm/user/menu', container: '#user_menu'},
							{module: 'm/user/gallery', container: '#user_content', options: {canAdd: true}}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, brief, menu, gallery, news) {
							}
						}
					);
				}
			}
		};
	}

	window.appRouter = globalVM.router;
	window.glob = globalVM;
	window.ss = socket;
	console.timeStamp('=== app load (' + appHash + ') ===');
});

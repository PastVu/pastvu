/*global require:true*/
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
	'domReady!',
	'jquery',
	'Browser', 'Utils',
	'socket',
	'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
	'globalVM', 'Params', 'renderer', 'RouteManager',
	'text!tpl/appMain.jade', 'css!style/common', 'css!style/appMain',
	'backbone.queryparams', 'momentlang/ru', 'bs/bootstrap-transition', 'knockout.extends', 'noty', 'noty.layouts/center', 'noty.themes/oldmos'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, globalVM, P, renderer, RouteManager, jade) {
	"use strict";
	var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
		routeDFD = $.Deferred();

	moment.lang('ru');

	$('body').append(jade);
	ko.applyBindings(globalVM);

	globalVM.router = new RouteManager(routerDeclare(), routeDFD);

	$.when(loadParams(), routeDFD.promise()).then(app);

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
		var loadTime;

		if (window.wasLoading) {
			loadTime = Number(new Date(Utils.cookie.get('oldmos.load.' + appHash)));
			if (isNaN(loadTime)) {
				loadTime = 100;
			} else {
				loadTime = Math.max(100, 2200 - (Date.now() - loadTime));
			}
			console.log(loadTime);
			if (!$.urlParam('stopOnLoad')) {
				window.setTimeout(startApp, loadTime);
			}
		} else {
			Utils.cookie.set('oldmos.load.' + appHash, (new Date()).toUTCString());
			startApp();
		}

		function startApp() {
			if (window.wasLoading) {
				$('#main_loader').remove();
				delete window.wasLoading;
			}
			Backbone.Router.namedParameters = true;
			Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
		}
	}

	function routerDeclare() {
		return {
			root: '/',
			routes: [
				{route: "", handler: "index"},
				{route: "p/:cid", handler: "photo"},
				{route: "photoUpload", handler: "photoUpload"},
				{route: "u", handler: "userPage"},
				{route: "u/", handler: "userPage"},
				{route: "u/:user", handler: "userPage"},
				{route: "u/:user/", handler: "userPage"},
				{route: "u/:user/:section", handler: "userPage"},
				{route: "u/:user/:section/", handler: "userPage"},
				{route: "u/:user/:section/:level1", handler: "userPage"},
				{route: "u/:user/:section/:level1/", handler: "userPage"}/*,
				{route: "u/:user", handler: "profile"},
				{route: "u/:user/photo", handler: "gallery"},
				{route: "u/:user/comments/:page", handler: "comments"},
				{route: "u/:user/settings", handler: "settings"},
				{route: "u/photoUpload", handler: "photoUpload"},
				{route: "u/clusterCalc", handler: "clusterCalc"},
				{route: "u/conveyer", handler: "conveyer"}*/
			],
			handlers: {
				index: function (params) {
					this.params({_handler: 'index'});

					renderer(
						[
							{module: 'm/top', container: '#topContainer'},
							{module: 'm/main/bodyPage', container: '#bodyContainer'}
							//{module: 'm/foot', container: '#footContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, bodyPage, foot) {
							}
						}
					);
				},
				photo: function (params) {
					this.params(_.assign(params, {_handler: 'photo'}));

					renderer(
						[
							{module: 'm/top', container: '#topContainer'},
							{module: 'm/photo/photo', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, photo) {
							}
						}
					);
				},
				userPage: function (params) {
					if (!params.user && !P.settings.LoggedIn()) {
						location.href = '/';
						return;
					}
					this.params(_.assign(params, {_handler: 'profile'}));

					renderer(
						[
							{module: 'm/top', container: '#topContainer'},
							{module: 'm/user/userPage', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, bodyPage, foot) {
							}
						}
					);
				},
				photoUpload: function (params) {
					if (!params.user && !P.settings.LoggedIn()) {
						location.href = '/';
						return;
					}
					this.params({photoUpload: true, _handler: 'profile'});

					renderer(
						[
							{module: 'm/top', container: '#topContainer'},
							{module: 'm/user/userPage', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (top, bodyPage, foot) {
							}
						}
					);
				}
			}
		};
	}

	//window.appRouter = globalVM.router;
	//window.glob = globalVM;
	console.timeStamp('=== app load (' + appHash + ') ===');
});
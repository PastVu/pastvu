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

	Utils.title.setPostfix('Фотографии прошлого');
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
				$('#apploader').remove();
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
				{route: "u/:user/:section/:page", handler: "userPage"},
				{route: "u/:user/:section/:page/", handler: "userPage"},
				{route: "confirm/:key", handler: "confirm"}/*,
				 {route: "u/clusterCalc", handler: "clusterCalc"},
				 {route: "u/conveyer", handler: "conveyer"}*/
			],
			handlers: {
				index: function (params) {
					this.params({_handler: 'index'});

					renderer(
						[
							{module: 'm/main/mainPage', container: '#bodyContainer'}
							//{module: 'm/foot', container: '#footContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (bodyPage, foot) {
							}
						}
					);
				},
				photo: function (params) {
					this.params(_.assign(params, {_handler: 'photo'}));

					renderer(
						[
							{module: 'm/photo/photo', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (bodyPage) {
							}
						}
					);
				},
				userPage: function (params) {
					var auth = globalVM.repository['m/common/auth'];
					if (!params.user && !auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!params.section) {
						params.section = 'profile';
					}
					this.params(_.assign(params, {_handler: 'profile'}));

					renderer(
						[
							{module: 'm/user/userPage', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (bodyPage, foot) {
							}
						}
					);
				},
				photoUpload: function () {
					this.params({section: 'photo', photoUpload: true, _handler: 'profile'});

					renderer(
						[
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
				confirm: function (params) {
					var auth = globalVM.repository['m/common/auth'];
					this.params(_.assign(params, {_handler: 'confirm'}));

					socket.once('checkConfirmResult', function (data) {
						if (data.error) {
							console.log('checkConfirmResult', data.message);
							globalVM.router.navigateToUrl('/');
						} else {

							renderer(
								[
									{module: 'm/main/mainPage', container: '#bodyContainer'}
								],
								{
									parent: globalVM,
									level: 0,
									callback: function (bodyPage, foot) {
									}
								}
							);

							if (data.type === 'noty') {
								window.noty(
									{
										text: data.message,
										type: 'confirm',
										layout: 'center',
										modal: true,
										force: true,
										animation: {
											open: {height: 'toggle'},
											close: {},
											easing: 'swing',
											speed: 500
										},
										buttons: [
											{addClass: 'btn-strict btn-strict-success', text: 'Ok (7)', onClick: function ($noty) {
												// this = $button element
												// $noty = $noty element
												$noty.close();
												globalVM.router.navigateToUrl('/');
											}}
										],
										callback: {
											afterShow: function () {
												var okButton = this.$buttons.find('.btn-strict-success');
												Utils.timer(
													8000,
													function (timeleft) {
														okButton.text('Ok (' + timeleft + ')');
													},
													function () {
														okButton.trigger('click');
													}
												);
											}
										}
									}
								);
							} else if (data.type === 'authPassChange' && data.login) {
								auth.showPassChangeRecall(data, params.key, function (result) {
									globalVM.router.navigateToUrl('/');
								}, this);
							}
						}
					});
					socket.emit('checkConfirm', {key: params.key});
				}
			}
		};
	}

	//window.appRouter = globalVM.router;
	//window.glob = globalVM;
	console.timeStamp('=== app load (' + appHash + ') ===');
});
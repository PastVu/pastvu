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

	Utils.title.setPostfix('Фотографии прошлого');

	var appHash = P.settings.appHash(),
		routerDeferred = $.Deferred(),
		routerAnatomy = {
			root: '/',
			globalModules: {
				modules: [
					{module: 'm/common/auth', container: '#auth', global: true},
					{module: 'm/common/top', container: '#topContainer', global: true}
				],
				options: {
					parent: globalVM,
					level: 0,
					callback: function (auth, top) {
						$.when(auth.loadMe()).done(function () {
							top.show();
							routerDeferred.resolve();
						});
					}
				}
			},
			routes: [
				{route: "", handler: "index"},
				{route: "p/(:cid)(/)", handler: "photo"},
				{route: "u(/)(:user)(/)(:section)(/)(:page)(/)", handler: "userPage"},
				{route: "news(/)(:cid)(/)", handler: "news"},
				{route: "photoUpload(/)", handler: "photoUpload"},
				{route: "confirm/:key", handler: "confirm"}
			],
			handlers: {
				index: function (qparams) {
					this.params({_handler: 'index'});

					renderer(
						[
							{module: 'm/main/mainPage', container: '#bodyContainer'}
						]
					);
				},
				photo: function (cid, qparams) {
					if (!cid) {
						location.href = '/';
						return;
					}

					this.params(_.assign({cid: cid, _handler: 'photo'}, qparams));
					renderer(
						[
							{module: 'm/photo/photo', container: '#bodyContainer'}
						]
					);
				},
				userPage: function (login, section, page, qparams) {
					var auth = globalVM.repository['m/common/auth'];
					if (!login && !auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!section) {
						section = 'profile';
					}
					this.params(_.assign({user: login, section: section, page: page, _handler: 'profile'}, qparams));

					renderer(
						[
							{module: 'm/user/userPage', container: '#bodyContainer'}
						]
					);
				},
				photoUpload: function () {
					this.params({section: 'photo', photoUpload: true, _handler: 'profile'});

					renderer(
						[
							{module: 'm/user/userPage', container: '#bodyContainer'}
						]
					);
				},
				news: function (cid, qparams) {
					Utils.title.setTitle({title: 'Новости'});
					this.params(_.assign({cid: cid, _handler: 'news'}, qparams));
					var mName = Number(cid) ? 'm/diff/news' : 'm/diff/newsList';

					renderer(
						[
							{module: mName, container: '#bodyContainer'}
						]
					);
				},
				confirm: function (key, qparams) {
					var auth = globalVM.repository['m/common/auth'];
					this.params(_.assign({key: key, _handler: 'confirm'}, qparams));

					socket.once('checkConfirmResult', function (data) {
						if (data.error) {
							console.log('checkConfirmResult', data.message);
							globalVM.router.navigateToUrl('/');
						} else {

							renderer(
								[
									{module: 'm/main/mainPage', container: '#bodyContainer'}
								]
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
								auth.showPassChangeRecall(data, key, function (result) {
									globalVM.router.navigateToUrl('/');
								}, this);
							}
						}
					});
					socket.emit('checkConfirm', {key: key});
				}
			}
		};

	moment.lang('ru');

	$('body').append(jade);
	ko.applyBindings(globalVM);

	globalVM.router = new RouteManager(routerAnatomy);

	$.when(loadParams(), routerDeferred.promise()).then(app);

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
			//Backbone.Router.namedParameters = true;
			Backbone.history.start({pushState: true, root: routerAnatomy.root, silent: false});
		}
	}

	//window.appRouter = globalVM.router;
	//window.glob = globalVM;
	console.timeStamp('=== app load (' + appHash + ') ===');
});
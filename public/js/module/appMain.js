/*global require:true, ga:true*/
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
	'domReady!',
	'jquery',
	'Browser', 'Utils',
	'socket!',
	'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
	'globalVM', 'Params', 'renderer', 'RouteManager',
	'model/Photo', 'model/User',
	'text!tpl/appMain.jade', 'css!style/appMain',
	'backbone.queryparams', 'momentlang/ru', 'bs/transition', 'bs/popover', 'knockout.extends', 'noty', 'noty.layouts', 'noty.themes/pastvu', 'jquery-plugins/scrollto'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, globalVM, P, renderer, RouteManager, Photo, User, html) {
	"use strict";

	Utils.title.setPostfix('Фотографии прошлого');

	var appHash = P.settings.appHash(),
		routerDeferred = $.Deferred(),
		routerAnatomy = {
			root: '/',
			globalModules: {
				modules: [
					{module: 'm/common/auth', container: '#auth', global: true},
					{module: 'm/common/top', container: '#topContainer', global: true},
					{module: 'm/common/foot', container: '#footContainer', global: true}
				],
				options: {
					parent: globalVM,
					level: 0,
					callback: function (auth, top) {
						top.show();
						routerDeferred.resolve();
					}
				}
			},
			routes: [
				{route: "", handler: "index"},
				{route: "p(/:cid)(/)", handler: "photo"},
				{route: "ps(/)(:page)", handler: "photos"},
				{route: "u(/:user)(/)(:section)(/)(:page)(/)", handler: "userPage"},
				{route: "news(/)(:cid)(/)", handler: "news"},
				{route: "photoUpload(/)", handler: "photoUpload"},
				{route: "confirm/:key", handler: "confirm"}
			],
			handlers: {
				index: function (qparams) {
					this.params(_.assign({_handler: 'index'}, qparams));
					ga('set', 'page', '/');

					renderer(
						[
							{module: 'm/main/mainPage', container: '#bodyContainer'}
						]
					);
				},
				photo: function (cid, qparams) {
					cid = Number(cid);
					if (!cid) {
						return globalVM.router.navigateToUrl('/ps');
					}
					this.params(_.assign({cid: cid, _handler: 'photo'}, qparams));
					ga('set', 'page', '/p' + (cid ? '/' + cid : ''));
					renderer(
						[
							{module: 'm/photo/photo', container: '#bodyContainer'}
						]
					);
				},
				photos: function (page, qparams) {
					this.params(_.assign({page: page, _handler: 'gallery'}, qparams));
					ga('set', 'page', '/ps' + (page ? '/' + page : ''));
					renderer(
						[
							{module: 'm/photo/gallery', container: '#bodyContainer', options: {topTitle: 'Галерея'}}
						]
					);
				},
				userPage: function (login, section, page, qparams) {
					var auth = globalVM.repository['m/common/auth'];
					if (!login && !auth.loggedIn()) {
						return globalVM.router.navigateToUrl('/');
					}
					if (!section) {
						section = 'profile';
					}
					this.params(_.assign({user: login, section: section, page: page, _handler: 'profile'}, qparams));

					ga('set', 'page', '/u' + (login ? '/' + login + (section ? '/' + section : '') : ''));
					renderer(
						[
							{module: 'm/user/userPage', container: '#bodyContainer'}
						]
					);
				},
				photoUpload: function () {
					this.params({section: 'photo', photoUpload: true, _handler: 'profile'});

					ga('set', 'page', '/photoUpload');
					renderer(
						[
							{module: 'm/user/userPage', container: '#bodyContainer'}
						]
					);
				},
				news: function (cid, qparams) {
					cid = Number(cid);
					var mName = cid ? 'm/diff/news' : 'm/diff/newsList';

					this.params(_.assign({cid: cid, _handler: 'news'}, qparams));
					ga('set', 'page', '/news' + (cid ? '/' + cid : ''));
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

							ga('set', 'page', '/confirm');
							ga('send', 'pageview', {title: 'Confirm'});
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
											{addClass: 'btn btn-success', text: 'Ok (7)', onClick: function ($noty) {
												// this = $button element
												// $noty = $noty element
												$noty.close();
												globalVM.router.navigateToUrl('/');
											}}
										],
										callback: {
											afterShow: function () {
												var okButton = this.$buttons.find('.btn-success');
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

	$('body').append(html);
	ko.applyBindings(globalVM);

	globalVM.router = new RouteManager(routerAnatomy);
	$.when(routerDeferred.promise()).then(app);

	function app() {
		//Backbone.Router.namedParameters = true;
		Backbone.history.start({pushState: true, root: routerAnatomy.root, silent: false});
	}

	//window.appRouter = globalVM.router;
	//window.glob = globalVM;
	console.log('APP %s loaded', appHash);
});
/*global require:true*/

require([
	'domReady!',
	'jquery',
	'Browser', 'Utils',
	'socket',
	'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
	'globalVM', 'Params', 'renderer', 'RouteManager',
	'text!tpl/appAdmin.jade', 'css!style/common', 'css!style/appAdmin',
	'backbone.queryparams', 'momentlang/ru', 'bs/bootstrap-transition', 'knockout.extends', 'noty', 'noty.layouts/center', 'noty.themes/oldmos'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, globalVM, P, renderer, RouteManager, jade) {
	"use strict";

	Utils.title.setPostfix('Администрирование - Фотографии прошлого');

	var appHash = P.settings.appHash(),
		routerDeferred = $.Deferred(),
		routerAnatomy = {
			root: '/admin/',
			globalModules: {
				modules: [
					{module: 'm/common/auth', container: '#auth', global: true},
					{module: 'm/common/top', container: '#topContainer', global: true},
					{module: 'm/admin/menu', container: '#menuContainer', global: true},
					{module: 'm/admin/submenu', container: '#subMenuContainer', global: true}
				],
				options: {
					parent: globalVM,
					level: 0,
					callback: function (auth, top, menu, submenu) {
						$.when(auth.loadMe()).done(function () {
							if (!auth.loggedIn()) {
								location.href = '/';
								return;
							}
							top.show();
							menu.show();
							submenu.show();
							routerDeferred.resolve();
						});
					}
				}
			},
			routes: [
				{route: "(:section)(/)(:param1)(/)(:param2)(/)", handler: "index"},
				{route: "map(/)(:section)(/)", handler: "map"},
				{route: "photo(/)(:section)(/)", handler: "photo"}
			],
			handlers: {
				index: function (section, param1, param2, qparams) {
					var auth = globalVM.repository['m/common/auth'],
						params,
						modules = [];
					if (!auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!section) {
						section = 'news';
					}

					if (section === 'news') {
						if (param1 === 'create' || param1 === 'edit') {
							params = {section: 'newsedit', cid: param2};
							modules.push({module: 'm/admin/newsEdit', container: '#bodyContainer'});
						} else {
							params = {section: section, cid: param1};
							modules.push({module: 'm/diff/news', container: '#bodyContainer'});
						}
					}
					this.params(_.assign(params, {_handler: 'index'}, qparams));
					renderer(modules);
				},
				map: function (section, qparams) {
					var auth = globalVM.repository['m/common/auth'],
						modules = [];
					if (!auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!section) {
						section = 'cluster';
					}
					this.params(_.assign({section: section, _handler: 'map'}, qparams));

					if (section === 'cluster') {
						modules.push({module: 'm/map/mapClusterCalc', container: '#bodyContainer'});
					}
					renderer(modules);
				},
				photo: function (section, qparams) {
					var auth = globalVM.repository['m/common/auth'],
						modules = [];
					if (!auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!section) {
						section = 'conveyer';
					}
					this.params(_.assign({section: section, _handler: 'photo'}, qparams));

					if (section === 'conveyer') {
						modules.push({module: 'm/admin/conveyer', container: '#bodyContainer'});
					}
					renderer(modules);
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
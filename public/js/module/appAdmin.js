/*global require:true*/

require([
	'domReady!',
	'jquery',
	'Browser', 'Utils',
	'socket!',
	'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
	'globalVM', 'Params', 'renderer', 'RouteManager',
	'text!tpl/appAdmin.jade', 'css!style/common', 'css!style/appAdmin',
	'backbone.queryparams', 'momentlang/ru', 'bs/bootstrap-transition', 'knockout.extends', 'noty', 'noty.layouts', 'noty.themes/pastvu'
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
					{module: 'm/admin/submenu', container: '#subMenuContainer', global: true},
					{module: 'm/common/foot', container: '#footContainer', global: true}
				],
				options: {
					parent: globalVM,
					level: 0,
					callback: function (auth, top, menu, submenu) {
						if (!auth.loggedIn() || auth.iAm.role() < 10) {
							location.href = '/';
							return;
						}
						top.show();
						menu.show();
						submenu.show();
						routerDeferred.resolve();
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
						section = 'main';
					}

					if (section === 'main') {
						params = {section: section};
						modules.push({module: 'm/admin/main', container: '#bodyContainer'});
					} else if (section === 'news') {
						if (param1 === 'create' || param1 === 'edit') {
							params = {section: section, cid: param2};
							modules.push({module: 'm/admin/newsEdit', container: '#bodyContainer'});
						} else {
							params = {section: section, cid: param1};
							modules.push({module: 'm/diff/newsList', container: '#bodyContainer'});
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
	$.when(routerDeferred.promise()).then(app);

	function app() {
		var loadTime;

		if (window.wasLoading) {
			loadTime = Number(Utils.cookie.getItem('pastvu.load.' + appHash));
			if (isNaN(loadTime)) {
				loadTime = 100;
			} else {
				loadTime = Math.max(100, 2200 - (Date.now() - loadTime));
			}
			if (!$.urlParam('stopOnLoad')) {
				window.setTimeout(startApp, loadTime);
			}
		} else {
			Utils.cookie.setItem('pastvu.load.' + appHash, String(Date.now()), 604800, '/', null);
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
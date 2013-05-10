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

	Utils.title.setPostfix('Администрирование - Фотографии прошлого');
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
			//Backbone.Router.namedParameters = true;
			Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
		}
	}

	function routerDeclare() {
		return {
			root: '/admin/',
			routes: [
				{route: "", handler: "index"},
				{route: "map(/)(:section)(/)", handler: "map"},
				{route: "photo(/)(:section)(/)", handler: "photo"}
			],
			handlers: {
				index: function (qparams) {
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
				map: function (section, qparams) {
					var auth = globalVM.repository['m/common/auth'];
					if (!login && !auth.loggedIn()) {
						location.href = '/';
						return;
					}
					if (!section) {
						section = 'profile';
					}
					this.params(_.assign({section: section, _handler: 'profile'}, qparams));

					renderer(
						[
							{module: 'm/map/mapClusterCalc', container: '#bodyContainer'}
						],
						{
							parent: globalVM,
							level: 0,
							callback: function (bodyPage, foot) {
							}
						}
					);
				}
			}
		};
	}

	//window.appRouter = globalVM.router;
	//window.glob = globalVM;
	console.timeStamp('=== admin load (' + appHash + ') ===');
});
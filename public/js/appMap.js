requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['lib/JSExtensions'],
	map: {
		'*': {
			'knockout': 'lib/knockout/knockout-2.1.0',
			'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
			'leaflet': 'lib/leaflet/leaflet_0.4.0.min'
		}
	},
	paths: {
		'jquery': 'lib/jquery/jquery-1.7.2.min',
		'socket.io': '/socket.io/socket.io',
		'domReady': 'lib/require/plugins/domReady',
		'text': 'lib/require/plugins/text',
		'async': 'lib/require/plugins/async',
		'goog': 'lib/require/plugins/goog',
		'Utils': 'lib/Utils',
		'Browser': 'lib/Browser',
	}
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
	'domReady',
	'jquery',
	'Browser', 'Utils',
	'socket',
	'EventTypes',
	'knockout', 'knockout.mapping',
	'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n',
	'leaflet', 'lib/leaflet/extends/L.neoMap', 'nav_slider',
	'Locations', 'KeyHandler', 'auth'
],function(domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, L, Map, navigationSlider, Locations, keyTarget, auth) {
	console.timeStamp('Require app Ready');
	
	var map, layers = {},
		mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng),
		poly_mgr, aoLayer,
		navSlider;
	
	/**
	 * Styles load list
	 */
	var StylesToLoad = [
		{s: 'style/jquery.toast.css', p: 2},
		{s: 'style/map_main.css', p: 10}
	];
	
	$.when(LoadParams(), waitForDomReady())
	 .pipe(LoadStyles.bind(null, StylesToLoad))
	 .pipe(auth.LoadMe)
	 .then(app);
	
	function waitForDomReady() {
		var dfd = $.Deferred();
		domReady(function(){console.timeStamp('Dom Ready'); dfd.resolve();})
		return dfd.promise();
	}
	function LoadParams(){
		var dfd = $.Deferred();
		socket.on('takeGlobeParams', function (json) {
			ko_mapping.fromJS(json, GlobalParams);
			dfd.resolve();
		});
		socket.emit('giveGlobeParams');
		return dfd.promise();
	}
	
	function LoadStyles(arr, doneCallback) {
		var getarray = [], i, len,
			style;

		console.groupCollapsed("Styles Loading");
		console.time("Styles loaded time");
		for (i = 0, len = arr.length; i < len; i += 1) {
			style = arr[i];
			getarray.push(Utils.addStyle(style.s+(style.t || '?__='+GlobalParams.appHash())));
		};
		return $.when.apply($, getarray).then(function () {
			console.log('All Styles loaded');
			console.timeEnd("Styles loaded time");
			console.groupEnd();
		});

	};
	
	function app () {
		
		createMap();
		navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'), map);
		
		new TopPanel('top_panel_fringe');
		
		var loadTime = Utils.getCookie('oldmos.load.'+GlobalParams.appHash());
		if (loadTime) {loadTime = new Date(loadTime);}
		else {loadTime = new Date(); Utils.setCookie('oldmos.load.'+GlobalParams.appHash(), loadTime.toUTCString());}
		
		if(!$.urlParam('stopOnLoad')) window.setTimeout(function(){
			document.getElementById('main_loader').classList.remove('visi');
			document.querySelector('#main').style.opacity = '1';
		}, Math.max(100, 2500 - (new Date() - loadTime)) );
		
		//if(init_message) $().toastmessage('showSuccessToast', init_message);
	}
	
	function createMap() {
		map = new L.neoMap('map', {center: mapDefCenter, zoom: Locations.current.z, minZoom: 0,	maxZoom: 18, zoomAnimation: true});
	
		layers = map.layers;
		var systems = document.createDocumentFragment(), sysElem, typeElem, sysNum = 0;

		for (var lay in layers){
			if (!layers.hasOwnProperty(lay)) continue;
			
			sysElem = $('<div/>',  {id : lay})
					  .append($('<span/>', {'class': 'head', 'html': layers[lay].desc}));
					  
			for (var type in layers[lay].types) {
				if (!layers[lay].types.hasOwnProperty(type)) continue;
				
				typeElem = $('<div/>', {html: layers[lay].types[type].desc, 'maptp': type}).appendTo(sysElem);
				Utils.Event.add(typeElem[0], 'click', function(event, s, t){
					map.selectLayer(s, t);
				}.neoBind(typeElem[0], [lay, type]));
				layers[lay].types[type].dom = typeElem[0];
			}
			systems.appendChild(sysElem[0]);
			sysNum++;
		}

		document.querySelector('#layers_panel #systems').appendChild(systems);
		document.querySelector('#layers_panel #systems').classList.add('s'+sysNum);
		
		Locations.subscribe(function(val){
			mapDefCenter = new L.LatLng(val.lat, val.lng);
			setMapDefCenter(true);
		});
		
		if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
			map.selectLayer.apply(map, window.localStorage['arguments.SelectLayer'].split(','))
		} else {
			map.selectLayer('osm', 'mapnik');
		}
	}

	
	function setMapDefCenter(forceMoveEvent){
		map.setView(mapDefCenter, Locations.current.z, false);
	}
	
});

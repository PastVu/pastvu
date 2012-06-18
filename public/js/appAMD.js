requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['./JSExtensions'],
	callback: function(module1, module2) {
		console.timeStamp('AMD depends loaded');
	},
	map: {
		'*': {
			'knockout': 'knockout-2.1.0',
			'knockout.mapping': 'knockout.mapping-latest',
			'leaflet': 'leaflet_0.4.0'
		}
	},
	paths: {
		'domReady': 'require_plugins/domReady',
		'async': 'require_plugins/async',
		'goog': 'require_plugins/goog'
	},
	shim: {
		'socket':{
            deps: ['/socket.io/socket.io.js'],
            exports: 'socket'
		}
	}
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

require(
['domReady', 'jquery', 'knockout', 'Utils', 'socket', 'EventTypes', 'mvvm/GlobalParams', 'mvvm/i18n', 'leaflet', 'L.Google', 'Locations'],
function(domReady, $, ko, Utils, socket, ET, GlobalParams, i18n, L, LGoogle, Locations) {
	console.timeStamp('Require app Ready');
	var map, layers = {}, curr_lay = {sys: null, type: null},
		poly_mgr, aoLayer,
		navSlider,
		login, reg, recall;
	
	domReady(app);
	
	function app () {
		console.timeStamp('Dom Ready');
		
		login = {
			head: document.querySelector('#login_fringe .head'),
			form: document.querySelector('#login_fringe form'),
			wait: document.querySelector('#login_fringe .wait'),
			mess: document.querySelector('#login_fringe .mess'),
			messchild: document.querySelector('#login_fringe .mess > div')
		};
		reg = {
			head: document.querySelector('#reg_fringe .head'),
			form: document.querySelector('#reg_fringe form'),
			wait: document.querySelector('#reg_fringe .wait'),
			mess: document.querySelector('#reg_fringe .mess'),
			messchild: document.querySelector('#reg_fringe .mess > div')
		};
		recall = {
			head: document.querySelector('#recall_fringe .head'),
			form: document.querySelector('#recall_fringe form'),
			wait: document.querySelector('#recall_fringe .wait'),
			mess: document.querySelector('#recall_fringe .mess'),
			messchild: document.querySelector('#recall_fringe .mess > div')
		};
		
		
		createMap();
		navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'));
	}
	
	function createMap() {
		if (GlobalParams.USE_OSM_API()) {
			layers.osm = {
				desc: 'OSM',
				types: {
					osmosnimki: {
						desc:'Osmosnimki',
						iColor:'black',
						obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png')
					},
					mapnik: {
						desc:'Mapnik',
						iColor:'black',
						obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
					},
					mapquest: {
						desc:'Mapquest',
						iColor:'black',
						obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {attribution:'Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">'})
					}
				}
			};
		}
		if (GlobalParams.USE_GOOGLE_API()) {
			layers.google = {
				desc: 'Google',
				types: {
					scheme: {
						desc:'Схема',
						iColor:'black',
						obj: new L.Google('ROADMAP')
					},
					sat: {
						desc:'Спутник',
						iColor:'black',//'white',
						obj: new L.Google('SATELLITE')
					},
					hyb: {
						desc:'Гибрид',
						iColor:'black',//'white',
						obj: new L.Google('HYBRID')
					},
					land: {
						desc:'Ландшафт',
						iColor:'black',
						obj: new L.Google('TERRAIN')
					}
				}
			};
		}

		function getSystemTypesObjs(sys){
			var ret = new Array();
			for (var typ in layers[sys].types){
				if (!layers[sys].types.hasOwnProperty(typ)) continue;
				ret.push(layers[sys].types[typ].obj);
			}
		}

		var layersArr = [];
		var systems = document.createDocumentFragment(), sysElem, typeElem, sysNum = 0;

		for (var lay in layers){
			if (!layers.hasOwnProperty(lay)) continue;
			
			sysElem = $('<div/>',  {id : lay});
			sysElem.append($('<span/>', {'class': 'head', 'html': layers[lay].desc}));
			for (var type in layers[lay].types) {
				if (!layers[lay].types.hasOwnProperty(type)) continue;
				typeElem = $('<div/>', {html: layers[lay].types[type].desc, 'maptp': type}).appendTo(sysElem);
				Utils.Event.add(typeElem[0], 'click', function(event, s, t){
					SelectLayer(s, t);
				}.neoBind(typeElem[0], [lay, type]));
				layers[lay].types[type].dom = typeElem[0];
				layersArr.push(layers[lay].types[type].obj);
			}
			systems.appendChild(sysElem[0]);
			sysNum++;
		}

		document.querySelector('#layers_panel #systems').appendChild(systems);
		document.querySelector('#layers_panel #systems').classList.add('s'+sysNum);

		
		map = new L.Map('map', {center: mapDefCenter, zoom: Locations.current.z});
		
		if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
			SelectLayer.apply(this, window.localStorage['arguments.SelectLayer'].split(','))
		} else {
			if (layers.yandex) SelectLayer('yandex', 'scheme');
			else SelectLayer('osm', 'osmosnimki');
		}
	}
	
	function getLocation() {
		$.when(getIp())
		 .then(getLocationByIp);

		geolocateMe();
	}

	function getIp() {
		return $.ajax({
			url: 'http://jsonip.appspot.com/',
			cache: false,
			success: function(json) {
				console.dir(json);
				if (Utils.isObjectType('string', json)) json = JSON.parse(json);
				myIP = json["ip"];
			},
			error: function(json) {
				console.error('Ошибка определения адреса и местоположения пользователя: ' + json.status + ' ('+json.statusText+')');
			}
		});
	}
	function getLocationByIp() {
		Utils.addScript('http://www.geoplugin.net/json.gp?ip='+myIP);
	}

	function geolocateMe() {
		if (Browser.support.geolocation) {
			navigator.geolocation.getCurrentPosition(show_map, handle_error, {enableHighAccuracy: true, timeout:5000, maximumAge: 5*60*1000});
		}
		
		function show_map(position) {
			Locations.set({gpsip: {lat:position.coords.latitude, lng:position.coords.longitude, z:15}});
		}
		function handle_error(err) {
			if (err.code == 1) {
				console.log('Geolocation failed because user denied. '+err.message);
			} else if (err.code == 2) {
				console.log('Geolocation failed because position_unavailable. '+err.message);
			} else if (err.code == 3) {
				console.log('Geolocation failed because timeout. '+err.message);
			} else if (err.code == 4) {
				console.log('Geolocation failed because unknown_error. '+err.message);
			}
		}
	}
	
});

function geoPlugin(data){
	if (!Locations.types['gpsip']) Locations.set({'gpsip': {lat: data.geoplugin_latitude, lng: data.geoplugin_longitude, z: 10}});
}
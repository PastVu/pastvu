requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['lib/JSExtensions'],
	map: {
		'*': {
			'knockout': 'lib/knockout/knockout-2.1.0',
			'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
			'leaflet': 'lib/leaflet/leaflet_0.4.0'
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
	'Locations', 'KeyHandler'
],function(domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, L, Map, navigationSlider, Locations, keyTarget) {
	console.timeStamp('Require app Ready');
	var map, layers = {}, curr_lay = {sys: null, type: null},
		mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng),
		poly_mgr, aoLayer,
		navSlider,
		login, reg, recall,
		iAmVM = null;
	
	/**
	 * Styles load list
	 */
	var StylesToLoad = [
		{s: 'style/jquery.toast.css', p: 2, t: '?vv=100'},
		{s: 'style/map_main.css', p: 10, t: '?cctv='+GlobalParams.appVersion()/*+'&verBuild='+GlobalParams.verBuild*/}
	];
	
	$.when(LoadParams(), waitForDomReady(), LoadStyles(StylesToLoad))
	 .pipe(LoadMe)
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
	
	function LoadMe(){
		var dfd = $.Deferred();
		socket.on('youAre', function (user) {
			GlobalParams.LoggedIn(!!user);
			console.dir(user);
			iAmVM = User.VM(user, iAmVM);
			dfd.resolve();
		});
		socket.emit('whoAmI');
		return dfd.promise();
	}
	
	function LoadStyles(arr, doneCallback) {
		var getarray = [], i, len,
			style;

		console.groupCollapsed("Styles Loading");
		console.time("Styles loaded time");
		for (i = 0, len = arr.length; i < len; i += 1) {
			style = arr[i];
			getarray.push(Utils.addStyle(style.s+(style.t || '')));
		};
		return $.when.apply($, getarray).then(function () {
			console.log('All Styles loaded');
			console.timeEnd("Styles loaded time");
			console.groupEnd();
		});

	};
	
	function app () {
		
		makeForms();
		createMap();
		navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'), map);
		
		new TopPanel(iAmVM, 'top_panel_fringe');
		
		var loadTime = Utils.getCookie('oldmos.load');
		if (loadTime) {loadTime = new Date(loadTime);}
		else {loadTime = new Date(); Utils.setCookie('oldmos.load', loadTime.toUTCString());}
		
		if(!$.urlParam('stopOnLoad')) window.setTimeout(function(){
			document.getElementById('main_loader').classList.remove('visi');
			document.querySelector('#main').style.opacity = '1';
		}, Math.max(100, 2500 - (new Date() - loadTime)) );
		
		//if(init_message) $().toastmessage('showSuccessToast', init_message);
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

		
		Locations.subscribe(function(val){
			mapDefCenter = new L.LatLng(val.lat, val.lng);
			setMapDefCenter(true);
		});
		map = new L.neoMap('map', {center: mapDefCenter, zoom: Locations.current.z});
		
		if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
			SelectLayer.apply(this, window.localStorage['arguments.SelectLayer'].split(','))
		} else {
			if (layers.yandex) SelectLayer('yandex', 'scheme');
			else SelectLayer('osm', 'osmosnimki');
		}
	}
	
	function SelectLayer(sys_id, type_id){
		if (!layers.hasOwnProperty(sys_id)) return;
		var sys = layers[sys_id];
		if (!sys.types.hasOwnProperty(type_id)) return;
		var type = sys.types[type_id];
		
		if (curr_lay.sys && curr_lay.type){
			var prev_selected = document.querySelector('#layers_panel #systems > div > div.selected');
			if (prev_selected){
				prev_selected.parentNode.firstChild.classList.remove('selected');
				prev_selected.classList.remove('selected');
			}
			
			if (curr_lay.type.iColor != type.iColor){
				document.querySelector('#main').classList.remove(curr_lay.type.iColor);
				document.querySelector('#main').classList.add(type.iColor);
			}
			
			map.removeLayer(curr_lay.type.obj);
		}else{
			document.querySelector('#main').classList.add(type.iColor);
		}

		type.dom.parentNode.firstChild.classList.add('selected');
		type.dom.classList.add('selected');
		document.querySelector('#current').innerHTML = sys.desc+': '+type.desc;
		
		if (!!window.localStorage) {
			window.localStorage['arguments.SelectLayer'] = Array.prototype.slice.call(arguments).join(',');
		}
		curr_lay.sys = sys; curr_lay.type = type;
		map.addLayer(type.obj);
	}
	
	function setMapDefCenter(forceMoveEvent){
		map.setView(mapDefCenter, Locations.current.z, false);
	}
	
	
	function makeForms() {
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
		
		login.form.onsubmit = Login;
		login.form.querySelector('#toReg').onclick = function(){LoginActivateSwap("#reg_fringe")};
		login.form.querySelector('#toRecall').onclick = function(){LoginActivateSwap("#recall_fringe")};
		login.form.querySelector('#remember_check').onclick = function(){LoginRememberCheck(this)};
		login.form.querySelector('.cancel').onclick = FormClose;
		
		reg.form.onsubmit = Register;
		reg.form.querySelector('#toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		reg.form.querySelector('.cancel').onclick = FormClose;
		
		recall.form.onsubmit = RecallAjax;
		recall.form.querySelector('#toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		recall.form.querySelector('.cancel').onclick = FormClose;
	}
	var opened_form;
	function FormOpen(selector){
		document.querySelector('#curtain').style.display = 'block';
		opened_form = document.querySelector(selector);
		opened_form.classList.add('active');
		FormFocus();
		
		keyTarget.push({
			id: 'loginOverlay',
			stopFurther: false,
			onEsc: FormClose
		});
	}
	window.FormOpen = FormOpen;
	function FormClose(){
		document.querySelector('#curtain').style.display = 'none';
		opened_form.classList.remove('active');
		FormReset();
		keyTarget.pop();
		opened_form = null;
	}
	function FormReset(){
		login.form.reset();
		reg.form.reset();
		login.messchild.innerHTML = ''; login.mess.style.height = 0; login.mess.classList.remove('err'); login.mess.classList.remove('good');
		reg.messchild.innerHTML = ''; reg.mess.style.height = 0; reg.mess.classList.remove('err'); reg.mess.classList.remove('good');
		ResetLoginActive();
	}
	function FormFocus(){
		window.setTimeout(function(){
			try{opened_form.querySelector('.initFocus').focus()} catch(e){}
		}, 800);
	}
	function LoginRememberCheck(box){
		box.classList.toggle('checked');
	}

	function LoginActivateSwap(selector) {
		var anotherElem = document.querySelector(selector);
		
		opened_form.classList.remove('delay');
		anotherElem.classList.add('delay');
		
		opened_form.classList.remove('active');
		anotherElem.classList.add('active');
		
		opened_form = anotherElem;
	}
	function ResetLoginActive() {
		/*var active = document.querySelector('.form.fringe.active');
		if (active !== document.querySelector('#login_fringe')){
			LoginActivateSwap(active.id);
		}*/
	}

	function Login() {
		login.wait.style.display = 'block';
		var remember_check = login.form.querySelector('#remember_check').classList.contains('checked');
		
		socket.on('loginResult', function (json) {
			if (json.success) {
				FormClose();
				$.ajax({
				  url: '/updateCookie',
				  cache: false,
				  success: function(json) {},
				  error: function(json) {}
				});
				LoadMe();
			} else {
				FormFocus();
				login.messchild.innerHTML = ''+(json.error || json);
				login.mess.classList.add('err');
				login.mess.style.height = login.messchild.offsetHeight+5+'px';
			}
			window.setTimeout(function(){login.wait.style.display = 'none';}, 300);
		});
		socket.emit('loginRequest', $.extend($(login.form).serializeObject(), {'remember': remember_check}));
		return false;
	}
	function Logout(){
		socket.on('logoutResult', function (json) {
			if (json.err){
				consol.log('Logout error' + json.err);
			}else {
				document.location = json.logoutPath;
			}
		});
		socket.emit('logoutRequest', {});
		return false;
	}
	window.Logout = Logout;
	function Register() {
		reg.wait.style.display = 'block';
		
		socket.on('registerResult', function (json) {
			if (json.success) {
				reg.form.querySelector('input[type="button"]').value = 'Finish';
				reg.form.querySelector('input[type="button"]').classList.add('fin');
				reg.form.querySelector('input[type="submit"]').style.display = 'none';
				reg.messchild.innerHTML = json.success;
				reg.mess.classList.add('good');
			}else {
				FormFocus();
				var message = ''+(json.error || json);
				reg.messchild.innerHTML = ''+message;
				reg.mess.classList.add('err');
			}
			reg.mess.style.height = reg.messchild.offsetHeight+5+'px';
			window.setTimeout(function(){reg.wait.style.display = 'none';}, 300);
		});
		socket.emit('registerRequest', $.extend($(reg.form).serializeObject(), {}));
		return false;
	}

	function RecallAjax(form) {
		recall.wait.style.display = 'block';
		
		socket.on('recallResult', function (json) {
			if (json.success) {
				recall.form.querySelector('input[type="button"]').value = 'Finish';
				recall.form.querySelector('input[type="button"]').classList.add('fin');
				recall.form.querySelector('input[type="submit"]').style.display = 'none';
				recall.messchild.innerHTML = json.success;
				recall.mess.classList.add('good');
			}else {
				FormFocus();
				var message = ''+(json.error || json);
				recall.messchild.innerHTML = ''+message;
				recall.mess.classList.add('err');
			}
			recall.mess.style.height = recall.messchild.offsetHeight+5+'px';
			window.setTimeout(function(){recall.wait.style.display = 'none';}, 300);
		});
		socket.emit('recallRequest', $(recall.form).serializeObject());
		
		return false;
	}
	
});

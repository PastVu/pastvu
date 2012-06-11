Utils.Event.add(window, 'load', onDOMLoad);

/**
 * GlobalSettings
 */
var GlobalParams = {
	Width: Utils.getClientWidth(),
	Height: Utils.getClientHeight(),
	
	USE_OSM_API: true,
	USE_GOOGLE_API: true,
	USE_YANDEX_API: true,
	appVersion: 0,
	verBuild: 0,
	
	locDef: {lat:40, lng:-17, z:3},
	locDefRange: ['gpsip', '_def_'],
	locDefRangeUser: ['last', 'home', 'gpsip', '_def_'],
	
	REGISTRATION_ALLOWED: false,
	LoggedIn: false
};

/**
 * GlobalSettings ViewModel
 */
var GlobalParamsVM;
var iAmVM;

var myIP,
	Locations = {
		types: {},
		range: [],
		
		current: null,
		
		subscribers: [],
		
		set: function (obj) {
			$.extend(this.types, obj);
			this.subscribersNotify();
		},
		setRange: function (ran) {
			this.range = ran;
		},
		setRangeTypePos: function (type, pos) {
			this.range = ran;
		},
		subscribe: function (fn, context) {
			this.subscribers.push({fn: fn, context: context});
		},
		subscribersNotify:  function () {
			this.current = this.get();
			this.subscribers.forEach(function(element, index, array){
				element['fn'].call(element['context'] || null, this.current);
			}, this);
		},
		get: function(){
			for (var i=0; i<this.range.length; i++){
				if (this.types[this.range[i]]) return this.types[this.range[i]];
			}
		}
	};
Locations.setRange(GlobalParams.locDefRange);
Locations.set({'_def_': GlobalParams.locDef});

/**
 * i18n
 */
var i18n = {
	en : {
		login : 'Login',
		logout : 'Logout',
		register : 'Registration',
		admin : 'Administration'
	},
	ru : {
	}
};
/**
 * i18n ViewModel
 */
var i18nVM;
function i18nToKO(lang){
	if (!i18nVM) i18nVM = ko.mapping.fromJS(i18n[lang]);
	else ko.mapping.fromJS(i18n[lang], i18nVM);
}

var init_message;

/**
 * Socket.IO
 */
var socket;

function onDOMLoad() {
	main_loader.classList.add('visi');
	socket = io.connect(location+'');
	socket.on('initMessage', function (json) {
		init_message = json.init_message;
	});
	init_and_load();
}

function init_and_load(){
	$.when(LoadParams())
	 .pipe(PrepareAndLoadSources)
	 .then(startApp);

	getLocation();
}

function LoadParams(){
	var dfd = $.Deferred();
	socket.on('takeGlobeParams', function (json) {
		$.extend(true, GlobalParams, json);
		dfd.resolve();
	});
	socket.emit('giveGlobeParams', {});
	return dfd.promise();
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
function geoPlugin(data){
	if (!Locations.types['gpsip']) Locations.set({'gpsip': {lat: data.geoplugin_latitude, lng: data.geoplugin_longitude, z: 10}});
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

function PrepareAndLoadSources(){
	/**
	 * JS load list
	 */
	var ScriptToLoad = [
		{chain: [
			{parallel: [
				{chain: [
					{s: 'js/leaflet_0.4.0.min.js', p: 10, t: '?vv=040'},
					(GlobalParams.USE_GOOGLE_API ? 
						(window.GMapsOnLoadDFD = $.Deferred() , window.GMapsOnLoad = function (){GMapsOnLoadDFD.resolve(); delete window.GMapsOnLoad; delete window.GMapsOnLoadDFD;} ,
						{s: 'http://maps.googleapis.com/maps/api/js?v=3.6&sensor=false&region=RU&callback=GMapsOnLoad', p: 10, t: '', waitForDeffered:window.GMapsOnLoadDFD})
						: undefined
					),
					(GlobalParams.USE_GOOGLE_API ? {s: 'js/L.Google.js', p: 5, t: '?appv='+GlobalParams.appVersion} : undefined)
				]},
				{s: 'js/KeyHandler.js', p: 5, t: '?appv='+GlobalParams.appVersion},
				{chain: [
					{s: 'js/knockout-2.1.0.js', p: 9, t: '?vv=210'},
					{s: 'js/knockout.mapping-latest.js', p: 5, t: '?vv=210'},
					{s: 'js/mvvm/User.js', p: 2, t: '?appv='+GlobalParams.appVersion},
					{s: 'js/mvvm/TopPanel.js', p: 2, t: '?appv='+GlobalParams.appVersion}
				]},
				(Browser.support.flash ? {s: 'js/swfobject/swfobject.js', p: 9, t: '?vv=210'} : undefined),
				{s: 'js/jquery.toast/jquery.toast.js', p: 3, t: '?appv='+GlobalParams.appVersion},
				/*,'js/raphael-min.js'*/
			]},
			{parallel:[
				{s: 'js/MediaContainer.js', p: 10, t: '?appv='+GlobalParams.appVersion},
				{s: 'js/NeoMarker.js', p: 10, t: '?appv='+GlobalParams.appVersion},
				{s: 'js/NeoPolygonManager.js', p: 5, t: '?appv='+GlobalParams.appVersion},
				{s: 'js/NeoPolygon.js', p: 10, t: '?appv='+GlobalParams.appVersion},
			]},
			{s: 'js/app.js', p: 15, t: '?appv='+GlobalParams.appVersion}
		]}
	];
	
	/**
	 * JS load list
	 */
	var StylesToLoad = [
		{s: 'style/leaflet_0.4.0.css', p: 2, t: '?vv=040'},
		{s: 'style/jquery.toast.css', p: 2, t: '?vv=100'},
		{s: 'style/map_main.css', p: 10, t: '?cctv='+GlobalParams.appVersion+'&verBuild='+GlobalParams.verBuild},
	];
	
	/**
	 * IMG preload list
	 */
	var IMGToLoad = [
		'images/map/arrow_down_black.png',
		'images/map/auth_small.png',
		'images/map/camera_black_new.png',
		'images/map/camera_blue_new.png',
		'images/map/camera_green_new.png',
		'images/map/camera_purple_new.png',
		'images/map/camera_yellow_new.png',
		'images/map/CamRulDown.png',
		'images/map/CamRulLeft.png',
		'images/map/CamRulRight.png',
		'images/map/CamRulUp.png',
		'images/map/close.png',
		'images/map/closehand.gif',
		'images/map/en.png',
		'images/map/full_view.png',
		'images/map/hide_controls.png',
		'images/map/icon_cam.png',
		'images/map/icon_cam_blue.png',
		'images/map/icon_cam_green.png',
		'images/map/icon_cam_purple.png',
		'images/map/icon_cam_yellow.png',
		'images/map/linked_cams.png',
		'images/map/map_minus_black.png',
		'images/map/map_plus_black.png',
		'images/map/map_stick_black.png',
		'images/map/matrixAdd.png',
		'images/map/matrixDel.png',
		'images/map/matrixHome.png',
		'images/map/matrixMax.png',
		'images/map/matrixMin.png',
		'images/map/matrixMin.png',
		'images/map/matrixToggle.png',
		'images/map/open_controls.png',
		'images/map/ru.png',
		'images/map/safari-checkbox.png',
		'images/map/same_size.png',
		'images/map/scale.png',
		'images/map/search_clear.png',
		'images/map/pin.png',
		'images/map/ZoomDash.png',
		'images/map/ZoomDashAct.png'
	];
	allPercent += 20;
	
	function removeEmptyArrays(arr) {
		for (var i = 0; i < arr.length; i += 1) {
			if (arr[i]===undefined){
				arr.splice(i, 1);
				i--;
			} else if (Utils.isObjectType('object', arr[i]) && (arr[i].chain || arr[i].parallel)) {
				if (removeEmptyArrays(arr[i][Utils.getObjectOneOwnProperty(arr[i])]).length < 1) {
					arr.splice(i, 1); i--;
				}
			} else {
				arr[i].p = arr[i].p || 10;
				allPercent += arr[i].p;
			}
		}
		return arr;
	}
	
	removeEmptyArrays(ScriptToLoad);
	removeEmptyArrays(StylesToLoad);
	
	return $.when(LoadScripts(ScriptToLoad), PreloadImg(IMGToLoad, null, LoaderIncrement.neoBind(null, [20], true, false))).
			 pipe(LoadStyles.neoBind(null, [StylesToLoad], true, false));
}

function GlobalParamsToKO(){
	if (!GlobalParamsVM) GlobalParamsVM = ko.mapping.fromJS(GlobalParams);
	else ko.mapping.fromJS(GlobalParams, GlobalParamsVM);
}

var LoadScripts = function () {
	function addVerScript(obj){
		var urlPostfix = obj.t || '',
			ret = Utils.addScript(obj.s+urlPostfix, LoaderIncrement.neoBind(null, [obj.p], true, false));
		if (obj.waitForDeffered) {
			return obj.waitForDeffered.promise();
		}else return ret;
	}
	
	function LoaderParallel(arr) {
		var getarray = [], i, len;
		for (i = 0, len = arr.length; i < len; i += 1) {
			if (arr[i].chain) {
				getarray.push(LoaderChain(arr[i].chain));
			} else {
				getarray.push(addVerScript(arr[i]));
			}
		};
		return $.when.apply($, getarray).done(function () {
			//console.log('Another PARALLEL loaded!');
		});
	}
	function LoaderChain(arr) {
		var dfd = $.Deferred();
		LoaderChainRecursive(dfd, arr, 0);
		return dfd.promise();
	}
	function LoaderChainRecursive(dfd, arr, index) {
		var exec, next;
		if (arr[index].parallel){
			exec = LoaderParallel.neoBind(this, [arr[index].parallel], true, false);
		} else {
			exec = addVerScript.neoBind(this, [arr[index]], true, false);
		}
		
		if (arr[index+1]){
			next = LoaderChainRecursive.neoBind(this, [dfd, arr, index+1], true, false);
		}else{
			next = function(){
				//console.log('Another CHAIN loaded!');
				window.setTimeout(function(){dfd.resolve()}, 50);
			};
		}
		$.when(exec()).done(next);
	}
	
	return function (arr) {
		var getarray = [], i, len;
		
		console.groupCollapsed("Scripts Loading");
		console.time("Scripts loaded time");
		for (i = 0, len = arr.length; i < len; i += 1) {
			if (arr[i].parallel){
				getarray.push(LoaderParallel(arr[i].parallel))
			} else if (arr[i].chain) {
				getarray.push(LoaderChain(arr[i].chain));
			}
		};
		return $.when.apply($, getarray).done(function () {
			console.log('All script loaded');
			console.timeEnd("Scripts loaded time");
			console.groupEnd();
		});
	};
	
}();

var PreloadImg = function (arr, postfix, doneCallback) {
	var dfd = $.Deferred();
	
	if (postfix)
		for (var i = 0, len = arr.length; i < len; i += 1) {
			arr[i] += postfix;
		}
		
	$.imgpreload(arr,
	{
		each: function(){},
		all: function(){
			console.log('Images Loaded');
			if (doneCallback) doneCallback();
			dfd.resolve();
		}
	});
	return dfd.promise();
};

var LoadStyles = function (arr, doneCallback) {
	var getarray = [], i, len,
		style;

	console.groupCollapsed("Styles Loading");
	console.time("Styles loaded time");
	for (i = 0, len = arr.length; i < len; i += 1) {
		style = arr[i];
		getarray.push(
			Utils.addStyle(style.s+(style.t || ''), LoaderIncrement.neoBind(null, [style.p], true, false))
		);
	};
	return $.when.apply($, getarray).then(function () {
		console.log('All Styles loaded');
		console.timeEnd("Styles loaded time");
		console.groupEnd();
	});

};

function startApp(){	
	if (window.app || Utils.isObjectType('function', window.app)) window.app();
	else alert('Ошибка инициализации приложения');
}
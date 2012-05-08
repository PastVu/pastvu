/**
 * Global vars
 */
var map, layers = {}, curr_lay = {sys: null, type: null},
	mapDefCenter = new L.LatLng(55.7418, 37.61),
	cams = {},
	playingFormat, mapDefCenter,
	poly_mgr, marker_mgr,
	markersLayer, aoLayer,
	navSlider,
	login, reg, recall, search,
	//mediaContainerManager,
	flag_current, flags_available,
	maxVideoPlaybackTime = 0;
	
/**
 * Event Types
 */
var ET = {
	mup: (Browser.support.touch ? 'touchend' : 'mouseup'),
	mdown: (Browser.support.touch ? 'touchstart' : 'mousedown'),
	mmove: (Browser.support.touch ? 'touchmove' : 'mousemove')
}

function createStructure() {
	
}

function app() {
	GlobalParamsToKO();
	i18nToKO('en');
	Utils.Event.add(window, 'resize', function(){GlobalParamsVM.Width(Utils.getClientWidth()); GlobalParamsVM.Height(Utils.getClientHeight());});
	
	flag_current = document.querySelector('#flag_current');
	flags_available = document.querySelector('#flags_available');
	
	//mediaContainerManager = new MediaContainerManager(GlobalParamsVM.MULTI_VIEW());
	
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
	search = {
		SearchArrow: document.querySelector('#searchArrow'),
		SearchInput: document.querySelector('#SearchInput'),
		searchClear: document.querySelector('#searchClear'),
	};
	
	Utils.Event.add(search.SearchInput, 'focus', srchFocus);
	Utils.Event.add(search.SearchInput, 'blur', srchBlur);
	
	createMap();
	
	//InitLocales();
	navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'));
	
	markersLayer = new L.LayerGroup();
	map.addLayer(markersLayer);
	marker_mgr = new MarkerManager(map, {layer: markersLayer});
	
	aoLayer = new L.LayerGroup();
	map.addLayer(aoLayer);
	poly_mgr = new PolygonManager(map, {layer: aoLayer});
	
	$.when(LoadAOs()/*, LoadCams()*/).done(DrawObjects);	
	
	MakeKnokout();
	CreateMVVM();
	BindMVVM();
	if(window.KeyHandler) window.KeyHandler();
}
function DrawObjects(){
	LoaderIncrement(4);
	window.setTimeout(function(){
		DrawCams();
		LoaderIncrement(7);
		window.setTimeout(function(){
			poly_mgr.refresh(true);
			LoaderIncrement(7, true);
			if(!$.urlParam('stopOnLoad')) window.setTimeout(function(){removeLoader(); document.querySelector('#main').style.opacity = '1';}, 500);
			if(init_message) $().toastmessage('showSuccessToast', init_message);
		},50);
	},50);	
}

function createMap() {
	if (GlobalParams.USE_OSM_API) {
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
	/*if (GlobalParams.USE_YANDEX_API) {
		layers.yandex = {
			desc: 'Яндекс',
			types: {
				scheme: {
					desc:'Схема',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Схема", {type:YMaps.MapType.MAP, sphericalMercator: true})
				},
				sat: {
					desc:'Спутник',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Спутник", {type:YMaps.MapType.SATELLITE, sphericalMercator: true})
				},
				hyb: {
					desc:'Гибрид',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Гибрид", {type:YMaps.MapType.HYBRID, sphericalMercator: true})
				}
			}
		};
	}*/
	if (GlobalParams.USE_GOOGLE_API) {
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

	
	map = new L.Map('map', {center: mapDefCenter, zoom: (Utils.getClientHeight()>Utils.getClientWidth() ? 11: 10)});
	if (!map.getCenter()) {
		setMapDefCenter();
	}
	
	if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
		SelectLayer.apply(this, window.localStorage['arguments.SelectLayer'].split(','))
	} else {
		if (layers.yandex) SelectLayer('yandex', 'scheme');
		else SelectLayer('osm', 'osmosnimki');
	}
}

function setMapDefCenter(forceMoveEvent){
	map.setView(mapDefCenter, (Utils.getClientHeight()>Utils.getClientWidth() ? 11: 10), false);
	//При setCenter срабатывает только событие смены зума, без moveend, поэтому сами вызываем событие у полигона
	if(forceMoveEvent) poly_mgr.onMapMoveEnd();
}

function SuperHome(){
	setMapDefCenter(true);
	if (layers.yandex) SelectLayer('yandex', 'scheme');
	else SelectLayer('osm', 'osmosnimki');
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

function ChangeZoom(diff){
	map.setZoom(map.getZoom()+diff);
}

var deltaH, deltaV;
function calcDelta(){
	deltaH = Math.floor(Utils.getClientWidth()/4),
	deltaV = Math.floor(Utils.getClientHeight()/4);
}
calcDelta(); Utils.Event.add(window, 'resize', calcDelta);
function mapUp() {
	map.panBy(new L.Point(0, -1*deltaV));
}
function mapDown() {
	map.panBy(new L.Point(0, deltaV));
}
function mapLeft() {
	map.panBy(new L.Point(-1*deltaH, 0));
}
function mapRight() {
	map.panBy(new L.Point(deltaH, 0));
}
keyTarget.push({
	id: 'mapArrows',
	source: window,
	stopFurther: true,
	onUp: mapUp, onUpHoldStart: upHoldStart, onUpHoldEnd: holdEnd,
	onDown: mapDown, onDownHoldStart: downHoldStart, onDownHoldEnd: holdEnd,
	onLeft: mapLeft, onLeftHoldStart: leftHoldStart, onLeftHoldEnd: holdEnd,
	onRight: mapRight, onRightHoldStart: rightHoldStart, onRightHoldEnd: holdEnd
});
var holdStart, holdTimeout;
!function holdRecursionScope(){
	var delay;
	function holdRecursion(funcToExec) {
		if(!Utils.isObjectType('function', funcToExec)){
			funcToExec = arguments[arguments.length-2];
		}
		funcToExec.call(this);
		//if (delay > 500) delay -= 100;
		holdTimeout = window.setTimeout(arguments[arguments.length-1], delay);
	}
	
	holdStart = function (func) {
		holdEnd();
		delay = 500;
		holdTimeout = window.setTimeout(holdRecursion.neoBind(this, [func]), delay);
	}
}();
function upHoldStart() {holdStart(mapUp);}
function downHoldStart() {holdStart(mapDown);}
function leftHoldStart() {holdStart(mapLeft);}
function rightHoldStart() {holdStart(mapRight);}
function holdEnd() {
	if(holdTimeout){
		window.clearTimeout(holdTimeout);
		holdTimeout = null;
	}
}

function ShowPanel(id){
	var showing = document.getElementById(id);
	var anotherPanels = new Array();
	if(id!='nav_panel') anotherPanels.push(document.querySelector('#nav_panel'));
	if(id!='layers_fringe') anotherPanels.push(document.querySelector('#layers_fringe'));
	for (var p = 0; p<anotherPanels.length; p++){
		if (anotherPanels[p].classList.contains('show')) anotherPanels[p].classList.remove('show');
	}
	showing.classList.toggle('show');
	if(id=='layers_fringe' && !showing.classList.contains('open')) showing.querySelector('#layers_panel').classList.add('open');
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

function Login(form) {
	login.wait.style.display = 'block';
	var remember_check = form.querySelector('#remember_check').classList.contains('checked');
	
	socket.on('authResult', function (json) {
		if (json.user){
			FormClose();
			GlobalParams.LoggedIn = true;
			GlobalParams.user = json.user;
			GlobalParamsToKO();
			
			$.ajax({
			  url: '/updateCookie',
			  cache: false,
			  success: function(json) {},
			  error: function(json) {}
			});
		}else {
			FormFocus();
			login.messchild.innerHTML = ''+(json.error || json);
			login.mess.classList.add('err');
			login.mess.style.height = login.messchild.offsetHeight+5+'px';
		}
		window.setTimeout(function(){login.wait.style.display = 'none';}, 300);
		
		//$.extend(true, GlobalParams, json);
		
	});
	socket.emit('authRequest', $.extend($(form).serializeObject(), {'remember': remember_check}));
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
function Register(form) {
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
	socket.emit('registerRequest', $.extend($(form).serializeObject(), {}));
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
	socket.emit('recallRequest', $(form).serializeObject());
	
	return false;
}

var locale_curr = '', curr_fringe;
function SetLocale(evt, id) {
	document.location = document.location.protocol+'//'+document.location.host+document.location.pathname+'?lang='+id;
	locale_curr = id;
}
function LocaleHintTouch(event, inner, fringe){
	LocaleHintOn(event, inner);
	LocaleHintMove(this);
}
function LocaleHintOn(event, inner, fringe){
	object_hint.querySelector('#hint_text').innerHTML = inner;
	object_hint.classList.add('locale');
	if(fringe){document.querySelector(fringe).classList.add('back'); curr_fringe = fringe;}
}
function LocaleHintMove(ele){
	var pos = Utils.getOffset(ele);
	object_hint.style.top = pos.top + ele.offsetHeight/2 - 2 - object_hint.offsetHeight/2 + "px";
	object_hint.style.right = Utils.getClientWidth() - pos.left + 7 + "px";
}
function LocaleHintOff(){
	object_hint.classList.remove('locale');
	object_hint.style.top = "auto";
	object_hint.style.right = "auto";
	if(curr_fringe){document.querySelector(curr_fringe).classList.remove('back'); curr_fringe = null;}
}
function InitLocales() {
	flag_current.style.backgroundImage = 'url("images/front_map/'+Server.locale+'.png")';
	if(Browser.support.touch){
		Utils.Event.add(flag_current, 'touchstart', LocaleHintTouch.neoBind(flag_current, [Server.messages['index.lang.currentLang']+Server.locales_available[Server.locale].name]));
		Utils.Event.add(flag_current, 'touchend', LocaleHintOff);
	}else{
		Utils.Event.add(flag_current, 'mousemove', function(){LocaleHintMove(this)});
		Utils.Event.add(flag_current, 'mouseover', LocaleHintOn.neoBind(this, [Server.messages['index.lang.currentLang']+Server.locales_available[Server.locale].name]));
		Utils.Event.add(flag_current, 'mouseout', LocaleHintOff);
	}
	var flag;
	for (var l in Server.locales_available){
		if (!Server.locales_available.hasOwnProperty(l) || l==Server.locale) continue;
		
		flag = $('<div/>', {'class' : "flag"})[0];
		Utils.Event.add(flag, 'click', SetLocale.neoBind(window, [l]));
		if(Browser.support.touch){
			Utils.Event.add(flag, 'touchstart', LocaleHintTouch.neoBind(flag, [Server.locales_available[l].name, '#layers_fringe']));
			Utils.Event.add(flag, 'touchend', LocaleHintOff);
		}else{
			Utils.Event.add(flag, 'mousemove', function(){LocaleHintMove(this)});
			Utils.Event.add(flag, 'mouseover', LocaleHintOn.neoBind(this, [Server.locales_available[l].name, '#layers_fringe']));
			Utils.Event.add(flag, 'mouseout', LocaleHintOff);
		}
		flag.style.backgroundImage = 'url("images/front_map/'+l+'.png")';
		flags_available.appendChild(flag);
	}
}

var mask = [[1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1]];
var maskLastChangedZoom;
function CheckMask(m1, m2){
	uplevel:
	for(var i=0; i<m1.length; i++){
		for(var j=0; j<m1[i].length; j++){
			 if ((m1[i][j] & m2[i][j]) > 0){continue uplevel;}
		}
		return false;
	}
	return true;
}
function FilterChange(element){
	var par = element.parentNode,
		mask_poss = element.id.substr(2).split('_').map(Number);
		
	element.classList.toggle('fon');
	mask[mask_poss[0]][mask_poss[1]] = Number(!mask[mask_poss[0]][mask_poss[1]]);
	poly_mgr.onMaskChanged(true);
	marker_mgr.updateObjects();
	SearchInVM.somethingChange(!SearchInVM.somethingChange());
}
function AOUps(element, up){
	if(Browser.name=='MSIE' && Browser.versionN < 9 || Browser.support.touch) return;

	var par = element.parentNode,
		mask_poss = element.id.substr(2).split('_').map(Number),
		emptymask = [[0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1]];
		
	emptymask[mask_poss[0]][mask_poss[1]] = Number(!emptymask[mask_poss[0]][mask_poss[1]]);
	var byMask = poly_mgr.getObjectsByMask(emptymask);
	for(var i=0; i<byMask.visible.length; i++){
		byMask.visible[i].doShadow = up;
		byMask.visible[i].draw();
	}
}

function LoadCams(){
	return $.ajax({
	  url: Server.paths.getAll,
	  cache: false,
	  success: function(json) {
		json.forEach(function(element, index, array){
			element.mask = element.mask.split('').map(Number);
			element.mask.splice(0, 0, element.mask.splice(0,11), element.mask.splice(0,mask[1].length));
			
			element.icon = 'images/front_map/icon_cam.png';
			if(element.mask[1][0]==1) element.icon = 'images/front_map/icon_cam_blue.png';
			else if(element.mask[1][1]==1) element.icon = 'images/front_map/icon_cam_yellow.png';
			else if(element.mask[1][2]==1) element.icon = 'images/front_map/icon_cam_green.png';
			else if(element.mask[1][4]==1) element.icon = 'images/front_map/icon_cam_purple.png';
			cams[element.id] = element;
		});
		for (var c in cams){
			if (!cams.hasOwnProperty(c)) continue;
			if (cams[c].relations)
			for (var r in cams[c].relations){
				if (!cams[c].relations.hasOwnProperty(r)) continue;
				if (cams.hasOwnProperty(r))	cams[c].relations[r] = cams[r];
				else delete	cams[c].relations[r];
			}
		}
	  },
	  error: function(json) {
		console.error('Ошибка загрузки камер: ' + json.status + ' ('+json.statusText+')');
	  }
	});
}

function DrawCams(){
	var icon, neomarker,
		iblack = 'images/front_map/camera_black_new.png',
		iblue = 'images/front_map/camera_blue_new.png',
		iyellow = 'images/front_map/camera_yellow_new.png',
		igreen = 'images/front_map/camera_green_new.png',
		ipurple = 'images/front_map/camera_purple_new.png';
	
	var markersLayerRaphael;// = Raphael(map._panes.markerPane, GlobalParams.Width, GlobalParams.Height);
	
	for (var c in cams){
		if (!cams.hasOwnProperty(c)) continue;
		icon = iblack;
		if(cams[c].mask[1][0]==1) icon = iblue;
		else if(cams[c].mask[1][1]==1) icon = iyellow;
		else if(cams[c].mask[1][2]==1) icon = igreen;
		else if(cams[c].mask[1][4]==1) icon = ipurple;
		
		neomarker = new L.NeoMarker((cams[c].lat && cams[c].lng ? new L.LatLng(cams[c].lat, cams[c].lng) : mapDefCenter), {id: c, img: icon});
		marker_mgr.addMarker(neomarker);
	}
	marker_mgr.refresh();
}

function LoadAOs(){
	return Utils.addScript('js/NeoPolygonsAO.js'+'?appv='+GlobalParams.appVersion);
}


ko.bindingHandlers.ScrollTop = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel) {
		/*Вызывается каждый раз вместе с перерендеринком template*/
		
		var valueUnwrapped = ko.utils.unwrapObservable(valueAccessor());
		window.setTimeout(function(){element.scrollTop = valueUnwrapped;}, 50);
    },
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
		var valueUnwrapped = ko.utils.unwrapObservable(valueAccessor());
		element.scrollTop = valueUnwrapped;
    }
};


function CamListVM(cams, maxH) {
	this.cams = ko.observableArray([]);
	this.DOMtempl = null;
	this.DOMRowsWrapper = null;
	this.containerH = ko.observable(0); this.containerHOld = 0; this.containerH.subscribe(this.containerHChange.neoBind(this));
	this.maxH = ko.observable(maxH || 0);
	this.scrollActive = ko.observable(false); this.scrollActive.subscribe(this.scrollActiveChange.neoBind(this));
	this.scrollTop = ko.observable(0);
	this.scrollDownNoScroll = ko.observable(false);
	
	if (cams){
		if (Utils.isObjectType('Array', cams)) this.replaceCamsByCamsArr(cams);
		else this.updateCamsByCamsHash(cams);
	}
}
CamListVM.prototype.updateCamsByCamsHash = function(camHash) {
	var arr = [];
	for (var c in camHash){
		if (!camHash.hasOwnProperty(c)) continue;
		arr.push(camHash[c]);
	}
	this.replaceCamsByCamsArr(arr);
};
CamListVM.prototype.replaceCamsByCamsArr = function(camArr) {
	this.cams(camArr);
};
CamListVM.prototype.addCam = function(cam){
	this.cams.push(cam);
};
CamListVM.prototype.checkForScroll = function(){
	var maxH, contentH;
	if (this.DOMtempl){
		maxH = this.maxH();
		contentH = this.DOMtempl.querySelector('.camListRows').offsetHeight;
		if (contentH <= maxH){
			this.scrollActive(false);
		} else {
			contentH = maxH;
			this.scrollActive(true);
		}
		this.containerH(contentH);
	}
};
CamListVM.prototype.containerHChange = function (newVal){
	if(this.scrollActive() && this.containerHOld!=0){
		var delta = newVal-this.containerHOld;
		//Если высота контейнер увеличивается, "вытягиваем" скроллер сверху. Если уменьшается, то будет "поджиматься" снизу.
		if (delta>0) this.ScrollRecalc(newVal-this.containerHOld);
	}
	this.containerHOld = newVal;
}
CamListVM.prototype.clickRow = function (cam, evt){
	marker_mgr.objects[cam.id].MarkerClick(evt);
};
CamListVM.prototype.scrollActiveChange = function (newVal){
	this.ScrollRecalc(Math.abs(this.scrollTop()));
};
CamListVM.prototype.Scroll = function (dir, step, wheel){
	var scrollTop = this.scrollTop(),
		hDelta = this.DOMRowsWrapper.offsetHeight - this.DOMRows.offsetHeight;

	if (dir=='down' && scrollTop > hDelta){
		scrollTop -= step;
		if (scrollTop < hDelta) scrollTop = hDelta;
	}else if (dir=='up' && scrollTop<0){
		scrollTop += step;
		if (scrollTop > 0) scrollTop = 0;
	}else if (!wheel) {ScrollMediaImgsOff(); return;}
	this.scrollTop(scrollTop);
	
	this.scrollDownNoScroll(scrollTop <= hDelta);
};
CamListVM.prototype.ScrollRecalc = function (delta){
	if (delta!=0) this.Scroll((delta > 0 ? 'up' : 'down'), Math.abs(delta));
};
CamListVM.prototype.ScrollOn = function (dir){
	this.ScrollinfoInterval = window.setInterval(function(){this.Scroll(dir, 10);}.neoBind(this),60);
};
CamListVM.prototype.ScrollOnUp = function (){
	this.ScrollOn('up');
};
CamListVM.prototype.ScrollOnDown = function (){
	this.ScrollOn('down');
};
CamListVM.prototype.ScrollOff = function (){
	if (this.ScrollinfoInterval) clearInterval(this.ScrollinfoInterval);
	this.ScrollinfoInterval = null;
};
CamListVM.prototype.OnWheel = function (viewModel, e){
	var dir;
	e = e.originalEvent || e;
	if (e.type=='DOMMouseScroll') dir = -1*e.detail;
	else dir = e.wheelDelta;
	if (dir>0) dir = 'up';
	else dir = 'down';
	this.Scroll(dir, 12, true);
	return false;
};
CamListVM.prototype.AfterTemplateRender = function(elements, data) {
	data.DOMtempl = elements[0];
	data.DOMRowsWrapper = elements[0].querySelector('.camListRowsWrapper');
	data.DOMRows = data.DOMRowsWrapper.querySelector('.camListRows');
};


function srchOpen(){
	if(SearchInVM.open()) return;
	SearchInVM.open(true);
}
function srchClose(){
	if(!SearchInVM.open()) return;
	SearchInVM.open(false);
}
function srchToggle(){
	if(SearchInVM.open()) srchClose();
	else srchOpen();
}
function srchFocus(){
	keyTarget.push({
		id: 'SearchInputOverlay',
		stopFurther: false,
		onEsc: srchBlur
	});
	srchOpen();
}
function srchBlur(){
	keyTarget.pop();
	search.SearchInput.blur();
}
function srchClear(){
	SearchInVM.query('');
}

var SearchInVM = {
	// Data
	open: ko.observable(false),
	query: ko.observable(''),
	respectFilter: ko.observable(true),
	applyMap: ko.observable(false),
	resultCount: ko.observable(0),
	
	somethingChange: ko.observable(true),
	
	CamList: null,
	
	// Behaviors
	toggleOpen: function(){
		var newBool = !this.open();
		this.open(newBool);
	},
	toggleFilter: function(){
		this.respectFilter (!this.respectFilter());
		if (this.applyMap() && !this.respectFilter()) this.toggleApplyMap();
	},
	toggleApplyMap: function(){
		var newBool = !this.applyMap();
		this.applyMap(newBool);
		if (newBool && !this.respectFilter()) this.respectFilter(true);
		
		if (!newBool)  marker_mgr.updateObjects();
	},
	clear: function(){this.query('')},
	setSize: function(){
		var search_out = document.querySelector('#search_panel #search_out');
		var possibleH = Utils.getDocumentHeight() - Utils.getOffset(search_out).top - 5;
		this.CamList.maxH(possibleH);
		this.CamList.checkForScroll();
	}
};


function MakeKnokout(){
	SearchInVM.CamList = new CamListVM();
	
	/**
	 * Через 100мс после открытия поиска пересчитываем размер search_out
	 */
	function SearchSizeChange(){SearchInVM.setSize();}
	SearchInVM.openThrottle = ko.computed({
		read: function() {
			if(this.open()){
				this.setSize();
				Utils.Event.add(window, 'resize', SearchSizeChange);
			}else{
				Utils.Event.remove(window, 'resize', SearchSizeChange);
			}
		},
		write: function (value) {
        },
		owner: SearchInVM
	}).extend({ throttle: 100 });
	
	SearchInVM.FindedCams = ko.computed({
		read: function() {
			var search = this.query().toLowerCase();
			var filter = this.respectFilter();
			this.somethingChange(); //Флаг во ViewModel, изменив который во вне, можно заново вызвать этот метот фильтрации

			var resultHash = {};

			if (search.length>0){
				for (var c in cams){
					if (!cams.hasOwnProperty(c)) continue;
					if (cams[c].address.toLowerCase().indexOf(search) >= 0 || cams[c].name.toLowerCase().indexOf(search) >= 0){
						if(filter && !CheckMask(cams[c].mask, mask)) continue;
						resultHash[c] = cams[c];
					}
				}
			}
			if (this.applyMap()) marker_mgr.updateObjects((search.length>0 ? resultHash : null));
			this.CamList.updateCamsByCamsHash(resultHash);
			this.resultCount(Utils.getObjectPropertyLength(resultHash));
			this.CamList.checkForScroll();
			return resultHash;
		},
		write: function (value) {
        },
		owner: SearchInVM
	}).extend({ throttle: 100 });

	//ko.applyBindings(GlobalParamsVM, document.getElementById('super_home_fringe'));
	ko.applyBindings(SearchInVM, document.getElementById('search_panel'));
	
	
	//MakeMatrixVM();
	//ko.applyBindings(MatrixVM, document.getElementById('matrix_button_fringe'));	
}

function mousePageXY(e){
	var x = 0, y = 0;	
	if (!e) e = window.event;
	if (e.touches && e.touches.item && e.touches.item(0)){
		var et = e.touches.item(0);
		if (et.pageX || et.pageY){
			x = et.pageX;
			y = et.pageY;
		}else if (et.clientX || et.clientY){
			x = et.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
			y = et.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
		}
	}else if (e.pageX || e.pageY){
		x = e.pageX;
		y = e.pageY;
	}else if (e.clientX || e.clientY){
		x = e.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
		y = e.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
	}	
	return {"x":x, "y":y};
}

function navigationSlider(slider){
	this.DOMPanel = slider;
	this.DOMSlider = document.createElement('div'); this.DOMSlider.id = 'nav_slider';
	this.DOMPanel.appendChild(this.DOMSlider);
	
	this.DomDashsArray = [];
	
	map.on('zoomend', this.onChangeZoom, this);
	
	this.DOMh = 9;
	this.offset = 0;
	this.usefulH = 171;
	this.sliderOnZoom = 0;
	
	this.SnatchBind = this.Snatch.neoBind(this);
	this.SnatchOffBind = this.SnatchOff.neoBind(this);
	this.SnatchOffByWindowOutBind = this.SnatchOffByWindowOut.neoBind(this);
	this.dashOverBind = this.dashOver.neoBind(this);
	this.dashClickBind = this.dashClick.neoBind(this);
	
	this.zoomChangeTimeout = null;
	
	Utils.Event.add(this.DOMPanel, ET.mdown, this.SnatchBind, false);
	
	//if(Browser.support.touch) Utils.Event.add(this.DOMPanel, 'touchstart', this.SnatchBind, false);
	
	this.recalcZooms();
}
navigationSlider.prototype.recalcZooms = function(){
	this.numZooms = map.getMaxZoom() - map.getMinZoom() + 1;
	this.step = this.usefulH/this.numZooms;

	for(var z=this.numZooms-1; z>=0; z--){
		this.DomDashsArray[z] = document.createElement('div');
		this.DomDashsArray[z].id = 'd'+z;
		this.DomDashsArray[z].style.height = this.step+'px';
		this.DomDashsArray[z].classList.add('dash');
		this.DOMPanel.insertBefore(this.DomDashsArray[z], this.DOMSlider);
		Utils.Event.add(this.DomDashsArray[z], 'click', this.dashClick.neoBind(this, [z]), true);
	}
	
	this.sliderOnZoom = map.getZoom();
	this.pos();
};
navigationSlider.prototype.dashClick = function(event, zoom){
	map.setZoom(zoom);
};
navigationSlider.prototype.dashOver = function(obj){
	var newZoom = Number(obj.target.id.substr(1));
	this.sliderOnZoom = newZoom;
	window.clearTimeout(this.zoomChangeTimeout);
	this.zoomChangeTimeout = window.setTimeout(function(){
		map.setZoom(newZoom);
	}, 500);
	this.pos();
};
navigationSlider.prototype.onChangeZoom = function(obj){
	this.sliderOnZoom = map.getZoom();
	this.pos();
};
navigationSlider.prototype.pos = function(){
	this.DOMSlider.style.bottom = this.step*this.sliderOnZoom-this.offset + 'px';
};
navigationSlider.prototype.Snatch = function(evt){
	for(var z=0; z<this.numZooms; z++){
		Utils.Event.add(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
		/*if(Browser.support.touch){
			Utils.Event.add(this.DomDashsArray[z], 'touchmove', function(){alert(9)}, false);
		}*/
	}
	Utils.Event.add(document.body, ET.mup, this.SnatchOffBind, false);
	Utils.Event.add(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
	
	
	/*if(Browser.support.touch){
		Utils.Event.add(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
		Utils.Event.add(document.body, 'touchend', this.SnatchOffBind, false);
	}*/
	
};
navigationSlider.prototype.SnatchOff = function(evt){
	Utils.Event.remove(document.body, ET.mdup, this.SnatchOffBind, false);
	Utils.Event.remove(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
	for(var z=0; z<this.numZooms; z++){
		Utils.Event.remove(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
	}
	/*if(Browser.support.touch){
		Utils.Event.remove(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
		Utils.Event.remove(document.body, 'touchend', this.SnatchOffBind, false);
	}*/
}
navigationSlider.prototype.SnatchOffByWindowOut = function(evt){
	var pos = mousePageXY(evt);
	if(pos.x<=0 || pos.x>=Utils.getDocumentWidth() ||
	   pos.y<=0 || pos.y>=Utils.getDocumentHeight()){
	   this.SnatchOff(evt);
	}
}
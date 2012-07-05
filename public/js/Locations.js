define (['jquery', 'Browser', 'knockout.mapping', 'mvvm/GlobalParams', 'http://www.geoplugin.net/javascript.gp'], function($, Browser, ko_mapping, GlobalParams){
	var Locations = {
		types: {'_def_': ko_mapping.toJS(GlobalParams.locDef)},
		range: GlobalParams.locDefRange(),
		
		current: ko_mapping.toJS(GlobalParams.locDef),
		
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
	
	
	/**
	 * Определяем координаты по ip
	 */
	try {
		if (geoplugin_status && geoplugin_status()=='200' && geoplugin_latitude && parseFloat(geoplugin_latitude(), 10) && geoplugin_longitude && parseFloat(geoplugin_longitude(), 10)) {
			 Locations.set({'gpsip': {lat: parseFloat(geoplugin_latitude(), 10), lng: parseFloat(geoplugin_longitude(), 10), z: 10}});
		}
	}catch(e){
		console.log('Locations geoplugin parse error');
	}
	
	/**
	 * Определяем координаты по Geolocation API
	 *//*
	if (Browser.support.geolocation) {
		!function geolocateMe() {
			navigator.geolocation.getCurrentPosition(show_map, handle_error, {enableHighAccuracy: true, timeout:5000, maximumAge: 5*60*1000});
			
			function show_map(position) {
				Locations.set({'gpsip': {lat:position.coords.latitude, lng:position.coords.longitude, z:15}});
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
		}();
	}*/
	
	return Locations;
});
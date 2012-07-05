/**
 * GlobalParams
 */
define(['socket', 'knockout', 'knockout.mapping', 'Utils'], function(socket, ko, ko_mapping, Utils) {
	var GlobalParams = ko_mapping.fromJS({
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
	});
	
	Utils.Event.add(window, 'resize', function(){GlobalParams.Width(Utils.getClientWidth()); GlobalParams.Height(Utils.getClientHeight());});
	
	return GlobalParams;
});
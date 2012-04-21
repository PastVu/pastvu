Utils.Event.add(window, 'load', onDOMLoad);

/**
 * GlobalSettings
 */
var GlobalParams = {
	Width: Utils.getClientWidth(),
	Height: Utils.getClientHeight(),
	ACCESS_LEVEL: "CLOSED_REGISTRATION",
	mediaFormat: 'flash',
	FLASH_PLAYER: 'uppod',
	MULTI_VIEW: false,
	USE_PRESET_OPTION: false,
	USE_OSM_API: true,
	USE_GOOGLE_API: true,
	USE_YANDEX_API: true,
	appVersion: 0
};
/**
 * GlobalSettings ViewModel
 */
var GlobalParamsVM;

function onDOMLoad() {
	init_and_load();
}

function init_and_load(){
	/*$.when(LoadParams()).then(function(){
		$.when(PrepareAndLoadSources()).then(
			startApp
		);
	});*/
}
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
	
	REGISTRATION_ALLOWED: false,
	LoggedIn: false
};
/**
 * GlobalSettings ViewModel
 */
var GlobalParamsVM;
/**
 * Модель управляет верхней панелью
 */
var TopPanelVM;

function CreateMVVM(){

	TopPanelVM = {
		// Data
		loggedIn: ko.computed({
			read: function(){
				return GlobalParamsVM.LoggedIn();
			},
			owner: TopPanelVM
		}),
		registrationAllowed: ko.computed({
			read: function(){
				return GlobalParamsVM.REGISTRATION_ALLOWED();
			},
			owner: TopPanelVM
		}),
		
		user: iAmVM,
		
		//i18n
		login: ko.computed({
			read: function(){return i18nVM.login();},
			owner: TopPanelVM
		}),
		logout: ko.computed({
			read: function(){return i18nVM.logout();},
			owner: TopPanelVM
		}),
		register: ko.computed({
			read: function(){return i18nVM.register();},
			owner: TopPanelVM
		}),
		profile: ko.computed({
			read: function(){
				if (GlobalParamsVM.LoggedIn())
					return iAmVM.fullName();
				else
					return '';
			},
			owner: TopPanelVM
		}),
		profileAvatar: ko.computed({
			read: function(){
				if (GlobalParamsVM.LoggedIn())
					return iAmVM.avatar();
				else
					return '';
			},
			owner: TopPanelVM
		})
		// Behaviors
	};
}

function BindMVVM(){
	ko.applyBindings(TopPanelVM, document.getElementById('top_panel_fringe'));
}
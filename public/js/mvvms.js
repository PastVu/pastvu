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
				return GlobalParamsVM.RegistrationAllowed();
			},
			owner: TopPanelVM
		}),
		
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
		// Behaviors
	};
}

function BindMVVM(){
	ko.applyBindings(TopPanelVM, document.getElementById('top_panel_fringe'));
}
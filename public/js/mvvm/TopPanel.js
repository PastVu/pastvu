/**
 * Модель управляет верхней панелью
 */
var TopPanelVM;

function CreateTopPanelVM(){

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

function BindTopPanelVM(){
	ko.applyBindings(TopPanelVM, document.getElementById('top_panel_fringe'));
}
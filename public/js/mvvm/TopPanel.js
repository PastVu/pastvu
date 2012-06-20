/**
 * Модель управляет верхней панелью
 */
define(['mvvm/GlobalParams', 'mvvm/i18n', 'knockout'], function(GlobalParams, i18nVM, ko){
	function TopPanelVM (iAmVM, dom) {
		this.user = iAmVM;
		
		loggedIn = ko.computed({
			read: function(){
				return GlobalParams.LoggedIn();
			},
			owner: TopPanelVM
		});
		registrationAllowed = ko.computed({
			read: function(){
				return GlobalParams.REGISTRATION_ALLOWED();
			},
			owner: TopPanelVM
		});
		login = ko.computed({
			read: function(){return i18nVM.login();},
			owner: TopPanelVM
		});
		logout = ko.computed({
			read: function(){return i18nVM.logout();},
			owner: TopPanelVM
		});
		register = ko.computed({
			read: function(){return i18nVM.register();},
			owner: TopPanelVM
		});
		admin = ko.computed({
			read: function(){return i18nVM.admin();},
			owner: TopPanelVM
		});
		profile = ko.computed({
			read: function(){
				if (GlobalParams.LoggedIn())
					return iAmVM.fullName();
				else
					return '';
			},
			owner: TopPanelVM
		});
		profileAvatar = ko.computed({
			read: function(){
				if (GlobalParams.LoggedIn())
					return iAmVM.avatar();
				else
					return '';
			},
			owner: TopPanelVM
		});
		
		ko.applyBindings(this, document.getElementById(dom));
	}
	
	return TopPanelVM;
});
/**
 * Модель управляет верхней панелью
 */
define(['mvvm/GlobalParams', 'mvvm/i18n', 'knockout', 'auth'], function(GlobalParams, i18nVM, ko, auth){

	function TopPanelVM (dom) {
		this.auth = auth;
		
		loggedIn = ko.computed({
			read: function(){
				return GlobalParams.LoggedIn();
			},
			owner: this
		});
		registrationAllowed = ko.computed({
			read: function(){
				return GlobalParams.REGISTRATION_ALLOWED();
			},
			owner: this
		});
		login = ko.computed({
			read: function(){return i18nVM.login();},
			owner: this
		});
		logout = ko.computed({
			read: function(){return i18nVM.logout();},
			owner: this
		});
		register = ko.computed({
			read: function(){return i18nVM.register();},
			owner: this
		});
		admin = ko.computed({
			read: function(){return i18nVM.admin();},
			owner: this
		});
		profile = ko.computed({
			read: function(){
				if (GlobalParams.LoggedIn())
					return this.auth.iAm.fullName();
				else
					return '';
			},
			owner: this
		});
		profileAvatar = ko.computed({
			read: function(){
				if (GlobalParams.LoggedIn())
					return this.auth.iAm.avatar();
				else
					return '';
			},
			owner: this
		});
		
		ko.applyBindings(this, document.getElementById(dom));
	}
	
	return TopPanelVM;
});
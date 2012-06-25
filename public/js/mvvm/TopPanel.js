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
		
		this.FormOpen = function () {
			document.querySelector('#curtain').style.display = 'block';
			opened_form = document.querySelector(selector);
			opened_form.classList.add('active');
			FormFocus();
			
			keyTarget.push({
				id: 'loginOverlay',
				stopFurther: false,
				onEsc: FormClose
			});
		};
		
		ko.applyBindings(this, document.getElementById(dom));
	}
		
	return TopPanelVM;
});
var User, UserVM;

/**
 * Модель управляет верхней панелью
 */
var TopPanelVM;

function CreateMVVM(){

	UserVM = ko.mapping.fromJS(User);
	UserVM.fullName = ko.computed(function() {
		if (this.firstName() && this.lastName()) return this.firstName() + " " + this.lastName();
		else return this.login();
	}, UserVM);


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
					return UserVM.fullName();
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
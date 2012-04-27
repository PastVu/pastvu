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
		
		// Behaviors
	};
}

function BindMVVM(){
	ko.applyBindings(TopPanelVM, document.getElementById('top_panel_fringe'));
}
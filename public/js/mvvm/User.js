var DefaultUser = {
	login: 'anonymous',
	email: '',
	
	//Profile
	avatar: '/ava/__def__.png',
	firstName: '',
	lastName: '',
	birthdate: '',
	sex: 'male',
	country: '',
	city: '',
	work: '',
	www: '',
	icq: '',
	skype: '',
	aim: '',
	lj: '',
	flickr: '',
	blogger: '',
	aboutme: ''
};

function UserActivate(model) {
	model = model || {};
	model = $.extend(DefaultUser, model);
	
	var vm = ko.mapping.fromJS(model);
	vm.fullName = ko.computed(function() {
		if (this.firstName() && this.lastName()) return this.firstName() + " " + this.lastName();
		else return this.login();
	}, vm);
	
	return vm;
}

function UserUpdate(model, vm) {
	if (!vm){ vm = UserActivate(model);
	} else {
		model = model || {};
		ko.mapping.fromJS(model, vm);
	}
	return vm;
}

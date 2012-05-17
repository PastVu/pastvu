var DefaultUser = {
	login: '',
	email: '',
	
	//Profile
	avatar: '/ava/__def__.png',
	firstName: 'Paul',
	lastName: 'Klimashkin',
	birthdate: '',
	sex: '',
	country: 'Russia',
	city: 'Moscow',
	work: 'Architecture',
	www: 'http://oldmos.ru',
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
	console.log('AAAAAAAAAAA '+model);
	if (!vm){ vm = UserActivate(model);
	} else {
		model = model || {};
		ko.mapping.fromJS(model, vm);
	}
	return vm;
}

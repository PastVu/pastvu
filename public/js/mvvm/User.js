define(['jquery', 'knockout', 'knockout.mapping', 'Utils'], function($, ko, ko_mapping, Utils) {
	var DefaultUser = {
		login: 'anonymous',
		email: '',
		
		//ROLE
		role_level: 0,
		role_name: 'anonymous',
		regdate: new Date(0),
		
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

	function UserVMCreate(m) {
		var model = $.extend(null, DefaultUser, m);
		
		var vm = ko_mapping.fromJS(model);
		vm.fullName = ko.computed(function() {
			if (this.firstName() && this.lastName()) return this.firstName() + " " + this.lastName();
			else return this.login();
		}, vm);
		
		return vm;
	}

	function UserVM(model, vm) {
		if (!vm){ vm = UserVMCreate(model);
		} else {
			model = model || {};
			ko_mapping.fromJS(model, vm);
		}
		vm.regdate(new Date(vm.regdate()));
		return vm;
	}
	
	return {def: DefaultUser, VM: UserVM};
});
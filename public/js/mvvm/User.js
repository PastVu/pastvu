var User = {
		login: '',
		email: '',
		
		//Profile
		avatar: '/ava/neo.jpg',
		firstName: '',
		lastName: '',
		birthdate: Date.now,
		sex: '',
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
	},
	UserVM;

function UserActivate(data) {
	data = data || {};
	User = $.extend(User, data);
	
	UserVM = ko.mapping.fromJS(User);
	UserVM.fullName = ko.computed(function() {
		if (this.firstName() && this.lastName()) return this.firstName() + " " + this.lastName();
		else return this.login();
	}, UserVM);
}

function UserUpdate(data) {
	console.log('AAAAAAAAAAA '+data);
	if (!UserVM){ UserActivate (data);
	} else {
		data = data || {};
		User = $.extend(User, data);
		
		ko.mapping.fromJS(data, UserVM);
	}
}

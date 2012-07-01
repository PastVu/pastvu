requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['JSExtensions'],
	map: {
		'*': {
			'knockout': 'knockout-2.1.0',
			'knockout.mapping': 'knockout.mapping-latest'
		}
	},
	paths: {
		'jquery': 'jquery-1.7.2.min',
		'socket.io': '/socket.io/socket.io',
		'domReady': 'require_plugins/domReady',
		'text': 'require_plugins/text',
		'jquery.datepick': 'jqplugins/datepick/jquery.datepick',
		'jquery.datepick.lang': 'jqplugins/datepick/jquery.datepick.lang'
	}
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require(
['domReady', 'jquery', 'Browser', 'Utils', 'socket', 'EventTypes', 'knockout', 'knockout.mapping', 'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n', 'KeyHandler', 'jquery.datepick', 'jquery.datepick.lang'],
function(domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget) {
	console.timeStamp('Require app Ready');
	var login, reg, recall,
		profileView, profileVM,
		iAmVM = null;
	
	$.when(LoadParams(), waitForDomReady())
	 .pipe(LoadMe)
	 .then(app);
	
	function waitForDomReady() {
		var dfd = $.Deferred();
		domReady(function(){console.timeStamp('Dom Ready'); dfd.resolve();})
		return dfd.promise();
	}
	function LoadParams(){
		var dfd = $.Deferred();
		socket.on('takeGlobeParams', function (json) {
			ko_mapping.fromJS(json, GlobalParams);
			dfd.resolve();
		});
		socket.emit('giveGlobeParams');
		return dfd.promise();
	}
	
	function LoadMe(){
		var dfd = $.Deferred();
		socket.on('youAre', function (user) {
			GlobalParams.LoggedIn(!!user);
			console.dir(user);
			iAmVM = User.VM(user, iAmVM);
			dfd.resolve();
		});
		socket.emit('whoAmI');
		return dfd.promise();
	}
		
	function app () {
		makeForms();
		new TopPanel(iAmVM, 'top_panel_fringe');
		
		profileView = document.getElementById('userProfile');
		
		socket.on('initMessage', function (json) {
			var init_message = json.init_message;
		});
		
		socket.on('takeUser', function (user) {
			profileVM = User.VM(user, profileVM);
			
			profileVM.edit = ko.observable(false);
			
			profileVM.originUser = user;
			
			profileVM.canBeEdit = ko.computed(function() {
				return iAmVM.login()==this.login() || iAmVM.role_level() >= 50;
			}, profileVM);
			
			profileVM.edit_mode = ko.computed(function() {
				return this.canBeEdit() && this.edit();
			}, profileVM);
			profileVM.edit_mode.subscribe(function(val){
				if (val){
					document.body.classList.add('edit_mode');
					window.setTimeout(function(){$('#in_birthdate').datepick($.extend({format: 'yyyy-mm-dd'}, $.datepick.regional['ru']));}, 1000);
					
				}else{
					document.body.classList.remove('edit_mode');
				}
			});
			
			profileVM.can_pm = ko.computed(function() {
				return iAmVM.login()!=this.login();
			}, profileVM);
			
			profileVM.saveUser = function (){
				var targetUser = ko_mapping.toJS(profileVM)
				console.dir(targetUser);
				for(var key in targetUser) {
					if (targetUser.hasOwnProperty(key) && key != 'login') {
						if (profileVM.originUser[key] && targetUser[key]==profileVM.originUser[key]) delete targetUser[key];
						else if (!profileVM.originUser[key] && targetUser[key]==User.def[key]) delete targetUser[key];
					}
				}
				if (Utils.getObjectPropertyLength(targetUser)>1) socket.emit('saveUser', targetUser);
				profileVM.edit(false);
			};
			
			ko.applyBindings(profileVM, profileView);
			
			profileView.classList.add('show');
			
		});
		socket.emit('giveUser', {login: location.href.substring(location.href.indexOf('/u/')+3)});
	
	}
	
	
	
	function makeForms() {
		login = {
			head: document.querySelector('#login_fringe .head'),
			form: document.querySelector('#login_fringe form'),
			wait: document.querySelector('#login_fringe .wait'),
			mess: document.querySelector('#login_fringe .mess'),
			messchild: document.querySelector('#login_fringe .mess > div')
		};
		reg = {
			head: document.querySelector('#reg_fringe .head'),
			form: document.querySelector('#reg_fringe form'),
			wait: document.querySelector('#reg_fringe .wait'),
			mess: document.querySelector('#reg_fringe .mess'),
			messchild: document.querySelector('#reg_fringe .mess > div')
		};
		recall = {
			head: document.querySelector('#recall_fringe .head'),
			form: document.querySelector('#recall_fringe form'),
			wait: document.querySelector('#recall_fringe .wait'),
			mess: document.querySelector('#recall_fringe .mess'),
			messchild: document.querySelector('#recall_fringe .mess > div')
		};
		
		login.form.onsubmit = Login;
		login.form.querySelector('#toReg').onclick = function(){LoginActivateSwap("#reg_fringe")};
		login.form.querySelector('#toRecall').onclick = function(){LoginActivateSwap("#recall_fringe")};
		login.form.querySelector('#remember_check').onclick = function(){LoginRememberCheck(this)};
		login.form.querySelector('.cancel').onclick = FormClose;
		
		reg.form.onsubmit = Register;
		reg.form.querySelector('#toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		reg.form.querySelector('.cancel').onclick = FormClose;
		
		recall.form.onsubmit = RecallAjax;
		recall.form.querySelector('#toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		recall.form.querySelector('.cancel').onclick = FormClose;
	}
	var opened_form;
	function FormOpen(selector){
		document.querySelector('#curtain').style.display = 'block';
		opened_form = document.querySelector(selector);
		opened_form.classList.add('active');
		FormFocus();
		
		keyTarget.push({
			id: 'loginOverlay',
			stopFurther: false,
			onEsc: FormClose
		});
	}
	window.FormOpen = FormOpen;
	function FormClose(){
		document.querySelector('#curtain').style.display = 'none';
		opened_form.classList.remove('active');
		FormReset();
		keyTarget.pop();
		opened_form = null;
	}
	function FormReset(){
		login.form.reset();
		reg.form.reset();
		login.messchild.innerHTML = ''; login.mess.style.height = 0; login.mess.classList.remove('err'); login.mess.classList.remove('good');
		reg.messchild.innerHTML = ''; reg.mess.style.height = 0; reg.mess.classList.remove('err'); reg.mess.classList.remove('good');
		ResetLoginActive();
	}
	function FormFocus(){
		window.setTimeout(function(){
			try{opened_form.querySelector('.initFocus').focus()} catch(e){}
		}, 800);
	}
	function LoginRememberCheck(box){
		box.classList.toggle('checked');
	}

	function LoginActivateSwap(selector) {
		var anotherElem = document.querySelector(selector);
		
		opened_form.classList.remove('delay');
		anotherElem.classList.add('delay');
		
		opened_form.classList.remove('active');
		anotherElem.classList.add('active');
		
		opened_form = anotherElem;
	}
	function ResetLoginActive() {
		/*var active = document.querySelector('.form.fringe.active');
		if (active !== document.querySelector('#login_fringe')){
			LoginActivateSwap(active.id);
		}*/
	}

	function Login() {
		login.wait.style.display = 'block';
		var remember_check = login.form.querySelector('#remember_check').classList.contains('checked');
		
		socket.on('loginResult', function (json) {
			if (json.success) {
				FormClose();
				$.ajax({
				  url: '/updateCookie',
				  cache: false,
				  success: function(json) {},
				  error: function(json) {}
				});
				LoadMe();
			} else {
				FormFocus();
				login.messchild.innerHTML = ''+(json.error || json);
				login.mess.classList.add('err');
				login.mess.style.height = login.messchild.offsetHeight+5+'px';
			}
			window.setTimeout(function(){login.wait.style.display = 'none';}, 300);
		});
		socket.emit('loginRequest', $.extend($(login.form).serializeObject(), {'remember': remember_check}));
		return false;
	}
	function Logout(){
		socket.on('logoutResult', function (json) {
			if (json.err){
				consol.log('Logout error' + json.err);
			}else {
				document.location = json.logoutPath;
			}
		});
		socket.emit('logoutRequest', {});
		return false;
	}
	window.Logout = Logout;
	function Register() {
		reg.wait.style.display = 'block';
		
		socket.on('registerResult', function (json) {
			if (json.success) {
				reg.form.querySelector('input[type="button"]').value = 'Finish';
				reg.form.querySelector('input[type="button"]').classList.add('fin');
				reg.form.querySelector('input[type="submit"]').style.display = 'none';
				reg.messchild.innerHTML = json.success;
				reg.mess.classList.add('good');
			}else {
				FormFocus();
				var message = ''+(json.error || json);
				reg.messchild.innerHTML = ''+message;
				reg.mess.classList.add('err');
			}
			reg.mess.style.height = reg.messchild.offsetHeight+5+'px';
			window.setTimeout(function(){reg.wait.style.display = 'none';}, 300);
		});
		socket.emit('registerRequest', $.extend($(reg.form).serializeObject(), {}));
		return false;
	}

	function RecallAjax(form) {
		recall.wait.style.display = 'block';
		
		socket.on('recallResult', function (json) {
			if (json.success) {
				recall.form.querySelector('input[type="button"]').value = 'Finish';
				recall.form.querySelector('input[type="button"]').classList.add('fin');
				recall.form.querySelector('input[type="submit"]').style.display = 'none';
				recall.messchild.innerHTML = json.success;
				recall.mess.classList.add('good');
			}else {
				FormFocus();
				var message = ''+(json.error || json);
				recall.messchild.innerHTML = ''+message;
				recall.mess.classList.add('err');
			}
			recall.mess.style.height = recall.messchild.offsetHeight+5+'px';
			window.setTimeout(function(){recall.wait.style.display = 'none';}, 300);
		});
		socket.emit('recallRequest', $(recall.form).serializeObject());
		
		return false;
	}
	
});

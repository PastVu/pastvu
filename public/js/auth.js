define(['domReady', 'jquery', 'socket', 'mvvm/GlobalParams', 'mvvm/User', 'mvvm/i18n', 'KeyHandler'], function(domReady, $, socket, GlobalParams, User, i18nVM, keyTarget){
	
	var auth = {},
		login, reg, recall,
		opened_form;
	
	domReady(function(){
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
		reg.form.querySelector('.toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		reg.form.querySelector('.cancel').onclick = FormClose;
		
		recall.form.onsubmit = RecallAjax;
		recall.form.querySelector('.toLogin').onclick = function(){LoginActivateSwap("#login_fringe")};
		recall.form.querySelector('.cancel').onclick = FormClose;
	});
	
	function FormOpen(selector){
		document.querySelector('#auth_curtain').style.display = 'block';
		opened_form = document.querySelector(selector);
		opened_form.classList.add('active');
		FormFocus();
		
		keyTarget.push({
			id: 'loginOverlay',
			stopFurther: false,
			onEsc: FormClose
		});
	}

	function FormClose(){
		document.querySelector('#auth_curtain').style.display = 'none';
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
			} else {
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
	
	var iAm = User.VM(User.def);
	
	function LoadMe(){
		var dfd = $.Deferred();
		socket.on('youAre', function (user) {
			GlobalParams.LoggedIn(!!user);
			console.dir(user);
			iAm = User.VM(user, iAm);
			dfd.resolve();
		});
		socket.emit('whoAmI');
		return dfd.promise();
	}
	
	auth.FormOpen = FormOpen;
	auth.Logout = Logout;
	auth.LoadMe = LoadMe;
	auth.iAm = iAm;
	
	return auth;
});
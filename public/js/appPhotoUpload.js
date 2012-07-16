requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['lib/JSExtensions'],
	map: {
		'*': {
			'knockout': 'lib/knockout/knockout-2.1.0',
			'knockout.mapping': 'lib/knockout/knockout.mapping-latest'
		}
	},
	paths: {
		'jquery': 'lib/jquery/jquery-1.7.2.min',
		'socket.io': '/socket.io/socket.io',
		'domReady': 'lib/require/plugins/domReady',
		'text': 'lib/require/plugins/text',
		'Utils': 'lib/Utils',
		'Browser': 'lib/Browser',
		'jquery.ui.widget': 'lib/jquery/ui/jquery.ui.widget',
		'jquery.fileupload': 'lib/jquery/plugins/fileupload'
	}
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require([
	'domReady',
	'jquery',
	'Browser', 'Utils',
	'socket',
	'EventTypes',
	'knockout', 'knockout.mapping',
	'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n',
	'KeyHandler', 'auth',
	'jquery.ui.widget', 'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload'
],function(domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget, auth) {
	console.timeStamp('Require app Ready');
	var login, reg, recall,
		profileView, profileVM;
	
	$.when(LoadParams(), waitForDomReady())
	 .pipe(auth.LoadMe)
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
		
	function app () {
		new TopPanel('top_panel_fringe');
		
		profileView = document.getElementById('userProfile');
		
		socket.on('initMessage', function (json) {
			var init_message = json.init_message;
		});
		
		socket.on('takeUser', function (user) {
			profileVM = User.VM(user, profileVM);
			
			profileVM.edit = ko.observable(false);
			
			profileVM.originUser = user;
			
			profileVM.canBeEdit = ko.computed(function() {
				return auth.iAm.login()==this.login() || auth.iAm.role_level() >= 50;
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
				return auth.iAm.login()!=this.login();
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
	
});

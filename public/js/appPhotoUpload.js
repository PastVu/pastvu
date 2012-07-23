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
		profileView, profileVM,
		uploadVM;
	
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
	
	var uploadVM = {
		// Data
		filereader: ko.observable(Browser.support.filereader),
		width: ko.computed({
			read: function(){
				return GlobalParams.Width();
			},
			owner: uploadVM
		}),
		height: ko.computed({
			read: function(){
				return GlobalParams.Height();
			},
			owner: uploadVM
		}),
	};
		
	function app () {
		new TopPanel('top_panel_fringe');
		ko.applyBindings(uploadVM, document.getElementById('now'));
		
	}
	
});

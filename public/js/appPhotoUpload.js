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
		'jquery.fileupload': 'lib/jquery/plugins/fileupload',
		'load-image': 'lib/jquery/plugins/fileupload/load-image',
		'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
		'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob'
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
	'jquery.ui.widget', 
	'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload', 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'
],function(domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget, auth) {
	'use strict';
	console.timeStamp('Require app Ready');
	var login, reg, recall,
		profileView, profileVM,
		uploadVM, fileupload;
	
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
		
		toUpload: ko.observableArray([])
	};
		
	function app () {
		new TopPanel('top_panel_fringe');
		ko.applyBindings(uploadVM, document.getElementById('now'));
		
		fileupload = $('#fileupload');
		// Initialize the jQuery File Upload widget:
		fileupload.fileupload();
		
        // Load existing files:
        $('#fileupload').each(function () {
            var that = this;
            $.getJSON(this.action, function (result) {
                if (result && result.length) {
                    $(that).fileupload('option', 'done')
                        .call(that, null, {result: result});
                }
            });
        });
		
		$('#fileupload').fileupload('option', {
            url: '//jquery-file-upload.appspot.com/',
            maxFileSize: 5000000,
            acceptFileTypes: /(\.|\/)(gif|jpe?g|png)$/i,
            process: [
                {
                    action: 'load',
                    fileTypes: /^image\/(gif|jpeg|png)$/,
                    maxFileSize: 20000000 // 20MB
                },
                {
                    action: 'resize',
                    maxWidth: 1440,
                    maxHeight: 900
                },
                {
                    action: 'save'
                }
            ]
        });
        // Upload server status check for browsers with CORS support:
        if ($.support.cors) {
            $.ajax({
                url: '//jquery-file-upload.appspot.com/',
                type: 'HEAD'
            }).fail(function () {
                $('<span class="alert alert-error"/>')
                    .text('Upload server currently unavailable - ' +
                            new Date())
                    .appendTo('#fileupload');
            });
        }
	}
	
});

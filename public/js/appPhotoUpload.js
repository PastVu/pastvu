/*global requirejs:true*/
requirejs.config({
    baseUrl: '/js',
    waitSeconds: 15,
    deps: ['lib/JSExtensions'],
    paths: {
        'tpl': '../tpl',
        'style': '../style',

        'jquery': 'lib/jquery/jquery-1.8.1.min',
        'socket.io': 'lib/socket.io',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'css': 'lib/require/plugins/css',
        'css.api': 'lib/require/plugins/css.api',
        'css.pluginBuilder': 'lib/require/plugins/css.pluginBuilder',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',

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
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'EventTypes',
    'knockout', 'knockout.mapping',
    'm/GlobalParams', 'm/User', 'm/TopPanel', 'm/i18n',
    'KeyHandler', 'auth',
    'jquery.ui.widget',
    'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload', 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'
], function (domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget, auth) {
    'use strict';
    console.timeStamp('Require app Ready');
    var login, reg, recall,
        profileView, profileVM,
        uploadVM, fileupload;

    $.when(loadParams())
        .pipe(auth.LoadMe)
        .then(app);

    function loadParams() {
        var dfd = $.Deferred();
        socket.on('takeGlobeParams', function (json) {
            ko_mapping.fromJS(json, GlobalParams);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    uploadVM = {
        // Data
        filereader: ko.observable(Browser.support.filereader),
        width: ko.computed({
            read: function () {
                return GlobalParams.Width();
            },
            owner: uploadVM
        }),
        height: ko.computed({
            read: function () {
                return GlobalParams.Height();
            },
            owner: uploadVM
        }),

        toUpload: ko.observableArray([])
    };

    /**
     * Для некоторых браузеров необходимо смещать input в сторону, чтобы срабатывало изменение курсора
     * При этом надо генерировать событие клик на таком input'е
     */
    ko.bindingHandlers.fileUploadInput = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            // First get the latest data that we're bound to
            var value = valueAccessor(), allBindings = allBindingsAccessor(),
                valueUnwrapped = ko.utils.unwrapObservable(value),
                $element = $(element),
                id = $element.attr('id');

            // Now manipulate the DOM element
            if (valueUnwrapped === true) {
                if (Browser.name === 'FIREFOX' || Browser.name === 'MSIE') {
                    $element
                        .css({'left': '141px'})
                        .attr('size', (viewModel.filereader() ? viewModel.width() / 8 : 10))
                        .on("click", function (event) {
                            event.stopPropagation(); // Чтобы опять не вызвать клик родительского элемента
                        })
                        .offsetParent().on("click", function (event) {
                            $('#' + id).trigger('click');
                        });
                }
            }
        }
    };

    //data-bind="style: {left: (browser == 'FIREFOX' || browser == 'MSIE' ? '110px' : '0px')}, attr:{size: (filereader() ? Math.round(width()/8) : 10)}")
    function app() {
        new TopPanel('top');
        ko.applyBindings(uploadVM, document.getElementById('now'));

        fileupload = $('#fileupload');
        // Initialize the jQuery File Upload widget:
        fileupload.fileupload();

        // Load existing files:
        /*$('#fileupload').each(function () {
            var that = this;
            $.getJSON(this.action, function (result) {
                if (result && result.length) {
                    $(that).fileupload('option', 'done')
                        .call(that, null, {result: result});
                }
            });
        });*/

        $('#fileupload').fileupload('option', {
            url: 'http://172.31.1.130:8888/',
            maxFileSize: 52428800, //50Mb
            maxNumberOfFiles: 10,
            previewSourceMaxFileSize: 52428800, //50MB The maximum file size of images that are to be displayed as preview:
            previewMaxWidth: 320, // The maximum width of the preview images:
            previewMaxHeight: 180, // The maximum height of the preview images:
            acceptFileTypes: /(\.|\/)(jpe?g|png)$/i,
            process: [
                {
                    action: 'load',
                    fileTypes: /^image\/(jpeg|png)$/,
                    maxFileSize: 52428800 // 50MB
                }/*,
                {
                    action: 'resize',
                    maxWidth: 1440,
                    maxHeight: 900
                },
                {
                    action: 'save'
                }*/
            ],
            change: function (e, data) {
                console.log(data.files.length);
            },
            drop: function (e, data) {
                console.log('drop');
            },
            dragover: function (e) {
                console.log('dragover');
            },
            done: function (e, data) {
                console.log('done');
            }
        });
        // Upload server status check for browsers with CORS support:
        /*if ($.support.cors) {
         $.ajax({
         url: '/pup',
         type: 'HEAD'
         }).fail(function () {
         $('<span class="alert alert-error"/>')
         .text('Upload server currently unavailable - ' +
         new Date())
         .appendTo('#fileupload');
         });
         }*/
    }

});
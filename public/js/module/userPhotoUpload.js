/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'text!tpl/userPhotoUpload.jade', 'css!style/userPhotoUpload', 'jquery.ui.widget', 'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload', 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, User, users, jade) {
    'use strict';

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
                        .attr('size', (viewModel.filereader() ? GP.Width() / 8 : 10))
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

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.u = null;

            this.$fileupload = this.$dom.find('#fileupload');
            this.filereader = ko.observable(Browser.support.filereader);
            this.toUpload = ko.observableArray([]);

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                this.u = vm;

                ko.applyBindings(globalVM, this.$dom[0]);

                // Initialize the jQuery File Upload widget:
                this.$dom.find('#fileupload').fileupload();
                this.$dom.find('#fileupload').fileupload('option', {
                    url: 'http://172.31.1.130:8888/',
                    dropZone: this.$dom.find('#addfiles_area'),
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

                this.show();

            }, this);
        },
        show: function () {
            this.$container.fadeIn();
        },
        hide: function () {
            this.$container.css('display', '');
        }
    });
});
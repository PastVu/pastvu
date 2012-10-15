/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'load-image', 'text!tpl/userPhotoUpload.jade', 'css!style/userPhotoUpload', 'jquery.ui.widget', 'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload', 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, User, users, loadImage, jade) {
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
                $element = $(element);

            // Now manipulate the DOM element
            if (valueUnwrapped === true) {
                if (Browser.name === 'FIREFOX' || Browser.name === 'MSIE') {
                    $element
                        .css({'left': '141px'})
                        //.attr('size', (viewModel.filereader() ? GP.Width() / 8 : 10))
                        .on("click", function (event) {
                            event.stopPropagation(); // Чтобы опять не вызвать клик родительского элемента
                        })
                        .parent().on("click", function (event) {
                            $(this).find("input[type='file']").trigger('click');
                        });
                }
            }
        }
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);

            this.auth = globalVM.repository['m/auth'];
            this.u = null;

            this.$fileupload = this.$dom.find('#fileupload');
            this.filereader = ko.observable(Browser.support.filereader);
            this.fileList = ko.observableArray([]);
            this.fileProgressAll = ko.observable(0);

            $(document)
                .on('dragenter', '#dropzone', function () {
                    this.parentNode.classList.add('dragover');
                })
                .on('dragleave', '#dropzone', function () {
                    this.parentNode.classList.remove('dragover');
                });

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                this.u = vm;

                ko.applyBindings(globalVM, this.$dom[0]);

                // Initialize the jQuery File Upload widget:
                this.$dom.find('#fileupload').fileupload();
                this.$dom.find('#fileupload').fileupload('option', {
                    url: 'http://localhost:8888/',
                    dropZone: this.$dom.find('.addfiles_area'),
                    maxFileSize: 52428800, //50Mb
                    maxNumberOfFiles: 10,
                    previewSourceMaxFileSize: 31457280, //30MB The maximum file size of images that are to be displayed as preview:
                    previewMaxWidth: 210, // The maximum width of the preview images:
                    previewMaxHeight: 140, // The maximum height of the preview images:
                    acceptFileTypes: /(\.|\/)(jpe?g|png)$/i,
                    prependFiles: true,
                    process: [
                        {
                            action: 'load',
                            fileTypes: /^image\/(jpeg|png)$/,
                            maxFileSize: 52428800 // 50MB
                        }
                    ],
                    change: this.fileAdd.bind(this),
                    drop: this.fileAdd.bind(this)
                    /*progressall: function (e, data) {
                        var progress = parseInt(data.loaded / data.total * 100, 10);
                        this.fileProgressAll(progress);
                    }.bind(this),*/
                    /*done: function (e, data) {
                        console.log('done');
                    }.bind(this)*/
                });

                this.show();

            }, this);
        },
        show: function () {
            this.$container.fadeIn(400, function () {
                this.$dom.find('#fileupload').fileupload('enable');
            }.bind(this));
        },
        hide: function () {
            this.$dom.find('#fileupload').fileupload('disable');
            $(document).off('dragenter').off('dragleave');
            this.$container.css('display', '');
        },
        localDestroy: function (destroy) {
            this.$dom.find('#fileupload').fileupload('destroy');
            destroy.call(this);
        },

        fileAdd: function (e, data) {
            this.$dom.find('.addfiles_area')[0].classList.remove('dragover');
            $.each(data.files, function (index, file) {
                //file.uid = Utils.randomString(7);
                //file.humansize = Utils.formatFileSize(file.size);
                //file.uploaded = ko.observable(false);
                this.fileList.push(file);
                /*loadImage(
                    file,
                    function (img) {
                        var td = this.$dom.find("[data-fileuid='" + file.uid + "']");
                        if (td.length > 0) {
                            td.append(img);
                            window.setTimeout(function () {
                                td.css({height: img.height, opacity: 1});
                                index = file = img = td = null;
                            }, 250);
                        }
                    }.bind(this),
                    {
                        maxWidth: 300,
                        maxHeight: 200,
                        canvas: true
                    }
                );*/
            }.bind(this));
        },
        send: function (viewModel) {
            var data = this.$dom.find('#fileupload').data('fileupload');
/*            this.$dom.find('#fileupload').fileupload('send', {files: viewModel.fileList()})
                .success(function (result, textStatus, jqXHR) {
                    console.log(textStatus);
                })
                .error(function (jqXHR, textStatus, errorThrown) { console.log(textStatus); })
                .complete(function (result, textStatus, jqXHR) { console.log(textStatus); });*/
            /*viewModel.fileList().forEach(function (item) {
                item.uploaded(true);
            });*/
        }
    });
});
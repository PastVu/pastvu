/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'load-image', 'text!tpl/user/photoUpload.jade', 'css!style/user/photoUpload', 'jquery.ui.widget', 'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload', 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, users, loadImage, jade) {
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
            this.fileUploaded = {};

            $(document)
                .on('dragenter', '#dropzone', function () {
                    this.parentNode.classList.add('dragover');
                })
                .on('dragleave', '#dropzone', function () {
                    this.parentNode.classList.remove('dragover');
                });

            var user = this.auth.iAm.login();
            if (P.settings.LoggedIn()) {
                users.user(user, function (vm) {
                    if (vm) {
                        this.u = vm;

                        ko.applyBindings(globalVM, this.$dom[0]);

                        // Initialize the jQuery File Upload widget:
                        this.$dom.find('#fileupload').fileupload();
                        this.$dom.find('#fileupload').fileupload('option', {
                            VM: this,
                            url: 'http://' + P.settings.domain() + ':' + P.settings.uport() + '/',
                            //dropZone: this.$dom.find('.addfiles_area'),
                            autoUpload: true,
                            maxFileSize: 26214400, //25Mb
                            maxNumberOfFiles: 10,
                            acceptFileTypes: /(\.|\/)(jpe?g|png)$/i,
                            previewSourceFileTypes: /(\.|\/)(jpe?g|png)$/i,
                            previewSourceMaxFileSize: 26214400, //25MB The maximum file size of images that are to be displayed as preview:
                            previewMaxWidth: 210, // The maximum width of the preview images:
                            previewMaxHeight: 140, // The maximum height of the preview images:
                            prependFiles: false,
                            singleFileUploads: true,
                            limitConcurrentUploads: 3,
                            sequentialUploads: false,
                            process: [
                                {
                                    action: 'load',
                                    fileTypes: /^image\/(jpeg|png)$/,
                                    maxFileSize: 26214400 // 25MB
                                }
                            ],
                            change: this.fileAdd.bind(this),
                            drop: this.fileAdd.bind(this),
                            always: function (e, data) {
                                /*if (data && data.result) {
                                 data.result.forEach(function (item, index, array) {
                                 if (item.name) {
                                 this.fileUploaded.push(item.name);
                                 socket.emit('saveUser', targetUser);
                                 }
                                 }.bind(this));
                                 }
                                 console.log('done');*/
                            }.bind(this)
                        });

                        this.show();
                    }

                }, this);
            } else {
                this.show();
            }
        },
        show: function () {
            if (this.options.popup) {
                this.$container.addClass('show');
                this.$dom.find('#fileupload').fileupload('enable');
            } else {
                this.$container.fadeIn(400, function () {
                    this.$dom.find('#fileupload').fileupload('enable');
                }.bind(this));
            }

            this.showing = true;
        },
        hide: function () {
            this.$dom.find('#fileupload').fileupload('disable');
            $(document).off('dragenter').off('dragleave');
            if (this.options.popup) {
                this.$container.removeClass('show');
            } else {
                this.$container.css('display', '');
            }
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
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
        },
        onUpload: function (data) {
            if (data) {
                data.forEach(function (item, index, array) {
                    if (item.name) {
                        var toSave = _.pick(item, 'format', 'w', 'h', 'size');
                        toSave.file = item.name;
                        toSave.login = this.u.login();
                        this.fileUploaded[item.name] = toSave;
                        socket.emit('createPhoto', toSave);

                        toSave = null;
                    }
                }.bind(this));
            }
        },
        onDestroy: function (name) {
            if (name && this.fileUploaded.hasOwnProperty(name)) {
                socket.emit('removePhoto', {login: this.u.login(), file: name});
                delete this.fileUploaded[name];
            }
        }
    });
});
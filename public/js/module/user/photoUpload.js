/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'load-image', 'text!tpl/user/photoUpload.jade', 'css!style/user/photoUpload', 'jquery.fileupload/jquery.iframe-transport', 'jquery.fileupload/jquery.fileupload'/*, 'jquery.fileupload/jquery.fileupload-ui', 'jquery.fileupload/locale'*/], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, users, loadImage, jade) {
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

            this.filesUploading = ko.observable(false);
            this.filesUploadingTimeout = null;
            this.fileProgressAll = ko.observable(0);
            this.fileProgressAllText = ko.observable('');

            this.previewToGen = 0;
            this.filesToSubmit = [];

            this.fileOptions = {
                auto: true,
                maxFiles: 10,
                maxSize: 926214400, //25Mb
                minSize: 10240, //10kB
                acceptTypes: /(\.|\/)(jpe?g|png)$/i,
                previewTypes: /(\.|\/)(jpe?g|png)$/i,
                previewAsCanvas: true,
                previewMaxSize: 10485760, //10MB The maximum file size of images that are to be displayed as preview:
                previewMaxWidth: 210, // The maximum width of the preview images:
                //previewMaxHeight: 120, // The maximum height of the preview images:
                prependFiles: false
            };

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
                            url: 'http://' + P.settings.domain() + ':' + P.settings.uport() + '/',
                            dropZone: $(document), //this.$dom.find('.addfiles_area'),
                            pasteZone: $(document),
                            singleFileUploads: true,
                            sequentialUploads: false,
                            limitConcurrentUploads: 3,

                            /*process: [
                             {
                             action: 'load',
                             fileTypes: /^image\/(jpeg|png)$/,
                             maxFileSize: 26214400 // 25MB
                             }
                             ],*/
                            //change: this.onFileAdd.bind(this),
                            //drop: this.onFileAdd.bind(this),
                            add: this.onFileAdd.bind(this),
                            submit: this.onFileSubmit.bind(this),
                            send: this.onFileSend.bind(this),
                            done: this.onFileDone.bind(this),
                            fail: this.onFileFail.bind(this),
                            start: this.onFilesStart.bind(this),
                            stop: this.onFilesStop.bind(this),
                            progress: this.onFileProgress.bind(this),
                            progressall: this.onFileProgressAll.bind(this)

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


        onFileAdd: function (e, data) {
            var options = this.fileOptions,
                optionsPlugin = this.$fileupload.data('fileupload').options,
                files = data.files;

            this.$dom.find('.addfiles_area')[0].classList.remove('dragover');
            $.each(files, function (index, file) {
                file.uid = Utils.randomString(7);
                file.humansize = Utils.formatFileSize(file.size);
                file.progress = ko.observable(0);
                file.uploading = ko.observable(false);
                file.uploaded = ko.observable(false);
                file.valid = true;
                file.error = ko.observable(false);
                file.hasPreview = ko.observable(options.previewMaxSize && file.size < options.previewMaxSize);
                file.msg = ko.observable('');
                file.msgCss = ko.observable('');

                this.validate(file, options);

                file.startUpload = function () {
                    data.submit();
                };

                if (options.auto) {
                    this.queueAfterPreview(file);
                } else {
                    this.filePreview(file);
                }

                this.fileList.push(file);
            }.bind(this));


        },
        queueAfterPreview: function (file) {
            this.filesToSubmit.push(file);
            if (file.hasPreview()) {
                this.previewToGen += 1;
                this.filePreview(file, this.submitQueue.bind(this));
            } else {
                this.submitQueue();
            }
        },
        submitQueue: function (file) {
            if (file) {
                this.previewToGen -= 1;
            }
            if (this.previewToGen < 1) {
                this.filesToSubmit.forEach(function (file, index) {
                    file.startUpload();
                });
                this.previewToGen = 0;
                this.filesToSubmit = [];
            }
        },
        onFileSubmit: function (e, data) {
            data.files.forEach(function (file, index) {
                file.uploading(true);
                file.uploaded(false);
                this.setMessage(file, 'Please wait. Loading..', 'muted');
            }, this);
        },
        onFileSend: function (e, data) {
            if (data.dataType && data.dataType.substr(0, 6) === 'iframe') {
                // Iframe Transport does not support progress events.
                // In lack of an indeterminate progress bar, we set
                // the progress to 100%, showing the full animated bar:
                alert('iFrame send. Need to handle');
            }
        },
        onFileDone: function (e, data) {
            var result = JSON.parse(data.result),
                toSaveArr = [];
            if (Utils.isObjectType('array', result)) {
                result.forEach(function (item, index, array) {
                    if (item.name) {
                        var toSave = _.pick(item, 'format', 'signature', 'w', 'h', 'size');
                        toSave.file = item.name;
                        toSaveArr.push(toSave);
                        this.fileUploaded[item.name] = toSave;
                        toSave = null;
                    }
                }, this);
                data.files.forEach(function (file, index) {
                    window.setTimeout(function () {
                        file.uploading(false);
                        file.uploaded(true);
                        this.setMessage(file, 'Successfully loaded', 'success');
                    }.bind(this), 500);
                }, this);
                socket.emit('createPhoto', toSaveArr);
            }
        },
        onFileFail: function (e, data) {
            //console.log('onFileFail ', 'data.errorThrown', data.errorThrown, 'data.textStatus', data.textStatus);
            data.files.forEach(function (file, index) {
                file.uploading(false);
                file.uploaded(false);
                file.error(true);
                this.setMessage(file, data.textStatus, 'error');
            }, this);
        },
        onFilesStart: function (e) {
            //console.log('start');
            window.clearTimeout(this.filesUploadingTimeout);
            this.fileProgressAll(0);
            this.filesUploading(true);
        },
        onFilesStop: function (e) {
            //console.log('stop');
            this.filesUploadingTimeout = window.setTimeout(function () {
                this.filesUploading(false);
            }.bind(this), 600);
        },
        onFileProgress: function (e, data) {
            var progress = parseInt(data.loaded / data.total * 100, 10);
            data.files.forEach(function (file, index) {
                file.progress(progress);
            }, this);
            e = data = progress = null;
        },
        onFileProgressAll: function (e, data) {
            //console.log('onFileProgressAll ', data.loaded, data.total);
            this.fileProgressAll(parseInt(data.loaded / data.total * 100, 10));
            this.fileProgressAllText(this.calcProgress(data));
        },
        onDestroy: function (name) {
            if (name && this.fileUploaded.hasOwnProperty(name)) {
                socket.emit('removePhoto', {file: name});
                delete this.fileUploaded[name];
            }
        },
        calcProgress: function (data) {
            return Utils.formatBitrate(data.bitrate) + ' | ' +
                Utils.secondsToTime((data.total - data.loaded) * 8 / data.bitrate) + ' | ' +
                Utils.formatPercentage(data.loaded / data.total) + ' | ' +
                Utils.formatFileSize(data.loaded) + ' / ' +
                Utils.formatFileSize(data.total);
        },
        validate: function (file, options) {
            if (this.fileList.length > options.maxFiles) {
                file.error(true);
                file.valid = false;
                this.setMessage(file, 'Maximum number of files exceeded', 'error');
            }
            // Files are accepted if either the file type or the file name matches against the acceptFileTypes regular expression,
            // as only browsers with support for the File API report the type:
            if (!(options.acceptTypes.test(file.type) || options.acceptTypes.test(file.name))) {
                file.error(true);
                file.valid = false;
                this.setMessage(file, 'Filetype not allowed', 'error');
            }
            if (options.maxSize && file.size > options.maxSize) {
                file.error(true);
                file.valid = false;
                this.setMessage(file, 'File is too big', 'error');
            }
            if (typeof file.size === 'number' && file.size < options.minSize) {
                file.error(true);
                file.valid = false;
                this.setMessage(file, 'File is too small', 'error');
            }
        },
        filePreview: function (file, cb) {
            var that = this,
                options = this.fileOptions;

            this.setMessage(file, 'Preparing file..', 'muted');
            loadImage(
                file,
                function (img) {
                    var node = that.$dom.find('.forcanvas[data-fileuid="' + file.uid + '"]');
                    if (node && node.length > 0) {
                        node.append(img);
                        node.css({height: img.height, opacity: 1});
                        if (cb) {
                            window.setTimeout(function () {
                                cb(file, true);
                            }, 600);
                        }
                        img = node = null;
                    } else {
                        if (cb) {
                            cb(file, false);
                        }
                    }
                    this.setMessage(file, '', 'muted');
                }.bind(this),
                {
                    maxWidth: options.previewMaxWidth,
                    maxHeight: options.previewMaxHeight,
                    canvas: options.previewAsCanvas
                }
            );
        },
        setMessage: function (file, text, type) {
            var css = '';
            switch (type) {
            case 'error':
                css = 'text-error';
                break;
            case 'warn':
                css = 'text-warning';
                break;
            case 'info':
                css = 'text-info';
                break;
            case 'success':
                css = 'text-success';
                break;
            default:
                css = 'muted';
                break;
            }

            file.msg(text);
            file.msgCss(css);

            text = type = css = null;
        }
    });
});
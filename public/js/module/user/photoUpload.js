/*global define:true, ga:true*/
/**
 * Модель загрузки фотографии
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'load-image', 'text!tpl/user/photoUpload.pug', 'css!style/user/photoUpload', 'jfileupload/jquery.iframe-transport', 'jfileupload/jquery.fileupload'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, loadImage, pug) {
    'use strict';

    var mess = {
        fsuccess: 'File has been successfully uploaded',
        fcount: 'Allowed count of files exceeded',

        ftype: 'File type does not correspond to the Rules',
        fmax: 'File is bigger then allowed',
        fmin: 'File is too small',
        fpx: 'According the rules, image size must be at least 350px on the smaller side and 700 on the larger side',
        finvalid: 'The file has not passed validation' //Сообщение по умолчанию для валидации
    };

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);

            this.auth = globalVM.repository['m/common/auth'];
            this.u = null;

            this.canLoad = ko.observable(false);
            this.canCountTotal = 0;
            this.canCount = ko.observable(0);
            this.toptext = ko.observable('');

            this.filereader = ko.observable(Browser.support.filereader);
            this.fileList = ko.observableArray([]);
            this.fileUploaded = {};

            this.filesUploading = ko.observable(false);
            this.filesUploadingTimeout = null;
            this.fileProgressAll = ko.observable(0);
            this.fileProgressAllText = ko.observable('');

            this.previewToGen = 0;
            this.filesToSubmit = [];

            var user = this.auth.iAm.login();
            if (this.auth.loggedIn() && !this.auth.iAm.nophotoupload()) {
                storage.user(user, function (data) {
                    if (data) {
                        this.u = data.vm;

                        this.getLimit(function (data) {
                            this.canCountTotal = data.limit;
                            this.canCount(this.canCountTotal);

                            if (!this.canCount()) {
                                this.toptext('You are out of limits for uploading files, because you have ' + this.u.pfcount() + ' unconfirmed images by moderator. It is maximum value for your profile type.');
                            } else {
                                this.toptext('Select files by pushing add button' + (this.filereader() ? ' or draging them inside dashed area' : ''));
                                this.canLoad(true);

                                this.fileOptions = {
                                    auto: true,
                                    maxFiles: this.canCountTotal,
                                    maxSize: 52428800, //50Mb
                                    minSize: 10240, //10kB
                                    acceptTypes: /(\.|\/)(jpe?g|png)$/i,
                                    previewTypes: /(\.|\/)(jpe?g|png)$/i,
                                    previewAsCanvas: true,
                                    previewMaxSize: 10485760, //10MB The maximum file size of images that are to be displayed as preview:
                                    previewMaxWidth: 210, // The maximum width of the preview images:
                                    //previewMaxHeight: 120, // The maximum height of the preview images:
                                    prependFiles: false
                                };
                            }

                            ko.applyBindings(globalVM, this.$dom[0]);

                            this.show();
                        }, this);
                    }
                }, this);
            } else {
                this.toptext(
                    this.auth.iAm.nophotoupload() ? "You don't have rights for uploading photos" : 'You are not authorized for uploading photos'
                );
                ko.applyBindings(globalVM, this.$dom[0]);
                this.show();
            }
        },
        show: function () {
            globalVM.func.showContainer(this.$container, function () {
                if (this.canLoad()) {
                    this.$fileupload = this.$dom.find('.uploadForm');

                    // Initialize the jQuery File Upload widget:
                    this.$fileupload.fileupload();
                    this.$fileupload.fileupload('option', {
                        url: '/upload',
                        dropZone: $(document), //this.$dom.find('.addfiles_area'),
                        pasteZone: $(document),
                        singleFileUploads: true,
                        sequentialUploads: false,
                        limitConcurrentUploads: 3,

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

                    $(document)
                        .on('dragenter', '#dropzone', function () {
                            this.parentNode.classList.add('dragover');
                        })
                        .on('dragleave', '#dropzone', function () {
                            this.parentNode.classList.remove('dragover');
                        });
                }

                if (this.modal) {
                    this.modal.$curtain.addClass('showModalCurtain');
                }
            }, this);

            this.showing = true;
        },
        hide: function () {
            this.$dom.find('.uploadForm').fileupload('disable');
            $(document).off('dragenter').off('dragleave');
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
            this.$dom.find('.uploadForm').fileupload('destroy');
            destroy.call(this);
        },

        selectFile: function (vm, e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            //Генерируем клик по инпуту
            this.$dom.find('.fileInput').trigger('click');
            return false;
        },

        startFile: function (file) {
            if (file.ext.valid) {
                file.ext.jqXHR = file.ext.data.submit();
            }
        },
        cancelFile: function (file) {
            //Если фото с этим файлом уже создалось, то вызываем его удаление,
            //если нет, значит оно загружается, и отменяем запрос на загрузку
            if (this.fileUploaded.hasOwnProperty(file.ext.file)) {
                socket.emit('photo.removeIncoming', { file: file.ext.file });
                delete this.fileUploaded[file.ext.file];
            } else if (file.ext.jqXHR && file.ext.jqXHR.abort) {
                file.ext.jqXHR.abort();
            }
            this.destroyFile(file);
        },
        destroyFile: function (file) {
            this.fileList.remove(file);
            this.canCount(Math.max(0, this.canCountTotal - this.fileList().length));
        },

        getLimit: function (cb, ctx) {
            socket.run('photo.giveNewLimit', { login: this.auth.iAm.login() }, true)
                .then(cb.bind(ctx));
        },
        onFileAdd: function (e, data) {
            var options = this.fileOptions,
            //optionsPlugin = (this.$fileupload.data('blueimp-fileupload') || this.$fileupload.data('fileupload') || {}).options,
                files = data.files;

            this.$dom.find('.addfiles_area')[0].classList.remove('dragover');

            $.each(files, function (index, file) {
                file.ext = {
                    uid: Utils.randomString(5),
                    data: data,
                    humansize: Utils.format.fileSize(file.size),
                    progress: ko.observable(0),
                    uploading: ko.observable(false),
                    uploaded: ko.observable(false),
                    valid: true,
                    error: ko.observable(false),
                    msg: ko.observable(''),
                    msgCss: ko.observable('')
                };

                this.validate(file, options);
                if (file.ext.valid) {
                    this.canCount(Math.max(0, this.canCount() - 1));

                    file.ext.tooBigPreview = options.previewMaxSize && file.size > options.previewMaxSize;

                    if (options.auto) {
                        this.queueAfterPreview(file);
                    } else {
                        this.filePreview(file);
                    }
                }

                this.fileList.push(file);
            }.bind(this));
        },
        queueAfterPreview: function (file) {
            this.filesToSubmit.push(file);
            if (!file.ext.tooBigPreview) {
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
                    this.startFile(file);
                }, this);
                this.previewToGen = 0;
                this.filesToSubmit = [];
            }
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
        onFileSubmit: function (e, data) {
            data.files.forEach(function (file, index) {
                file.ext.uploading(true);
                file.ext.uploaded(false);
                this.setMessage(file, 'Wait please. Loading..', 'muted'); //Please wait. Loading..
            }, this);
        },
        onFileSend: function (e, data) {
            if (data.dataType && data.dataType.substr(0, 6) === 'iframe') {
                // Iframe Transport does not support progress events.
                // In lack of an indeterminate progress bar, we set
                // the progress to 100%, showing the full animated bar:
                console.log('iFrame send. Need to handle');
            }
        },
        onFileDone: function (e, data) {
            var result = JSON.parse(data.result),
                receivedFiles = result.files || [];

            receivedFiles.forEach(function (receivedFileInfo) {
                if (receivedFileInfo.file) {
                    //Так как мы загружаем кадый файл отдельно в массивах всегда будет по одному элементу
                    data.files.forEach(function (file) {
                        file.ext.jqXHR = null;
                        delete file.ext.jqXHR;

                        if (!receivedFileInfo.error) {
                            file.ext.file = receivedFileInfo.file;
                            this.fileUploaded[receivedFileInfo.file] = _.pick(receivedFileInfo, 'file', 'name', 'mime', 'size');
                            window.setTimeout(function () {
                                file.ext.uploading(false);
                                file.ext.uploaded(true);
                                this.setMessage(file, mess.fsuccess, 'success');
                            }.bind(this), 500);
                        } else {
                            file.ext.uploading(false);
                            file.ext.uploaded(true);
                            this.setMessage(file, mess[receivedFileInfo.error] || mess.finvalid, 'error');
                        }
                    }, this);
                }
            }, this);
        },
        createPhotos: function (cb, ctx) {
            var toSaveArr = [];

            _.forEach(this.fileUploaded, function (file) {
                toSaveArr.push(file);
            });

            if (toSaveArr.length > 0) {
                socket.run('photo.create', { files: toSaveArr }, true).then(cb.bind(ctx));
            } else {
                cb.call(ctx, { cids: [] });
            }
        },
        onFileFail: function (e, data) {
            //console.log('onFileFail ', 'data.errorThrown', data.errorThrown, 'data.textStatus', data.textStatus);
            data.files.forEach(function (file, index) {
                file.ext.uploading(false);
                file.ext.uploaded(false);
                file.ext.error(true);
                this.setMessage(file, data.textStatus, 'error');
            }, this);
        },
        onFileProgress: function (e, data) {
            var progress = data.loaded / data.total * 100 >> 0;
            data.files.forEach(function (file, index) {
                file.ext.progress(progress);
            }, this);
            e = data = progress = null;
        },
        onFileProgressAll: function (e, data) {
            //console.log('onFileProgressAll ', data.loaded, data.total);
            this.fileProgressAll(data.loaded / data.total * 100 >> 0);
            this.fileProgressAllText(this.calcProgress(data));
        },
        calcProgress: function (data) {
            return Utils.format.bitrate(data.bitrate) + ' | ' +
                Utils.format.secondsToTime((data.total - data.loaded) * 8 / data.bitrate) + ' | ' +
                Utils.format.percentage(data.loaded / data.total) + ' | ' +
                Utils.format.fileSize(data.loaded) + ' / ' +
                Utils.format.fileSize(data.total);
        },
        validate: function (file, options) {
            if (!this.canCount()) {
                file.ext.error(true);
                file.ext.valid = false;
                this.setMessage(file, mess.fcount, 'error'); //Maximum number of files exceeded
            }
            // Files are accepted if either the file type or the file name matches against the acceptFileTypes regular expression,
            // as only browsers with support for the File API report the type:
            if (!(options.acceptTypes.test(file.type) || options.acceptTypes.test(file.name))) {
                file.ext.error(true);
                file.ext.valid = false;
                this.setMessage(file, mess.ftype, 'error'); //Filetype not allowed
            }
            if (options.maxSize && file.size > options.maxSize) {
                file.ext.error(true);
                file.ext.valid = false;
                this.setMessage(file, mess.fmax, 'error');
            }
            if (typeof file.size === 'number' && file.size < options.minSize) {
                file.ext.error(true);
                file.ext.valid = false;
                this.setMessage(file, mess.fmin, 'error');
            }
        },
        filePreview: function (file, cb) {
            var that = this,
                options = this.fileOptions;

            this.setMessage(file, 'Preparing file..', 'muted');
            loadImage(
                file,
                function (img) {
                    var node = that.$dom.find('.forcanvas[data-fileuid="' + file.ext.uid + '"]');
                    if (node && node.length > 0) {
                        node.append(img);
                        node.css({ height: img.height, opacity: 1 });
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

            file.ext.msg(text);
            file.ext.msgCss(css);

            text = type = css = null;
        }
    });
});

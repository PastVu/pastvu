/*global define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'load-image', 'text!tpl/user/photoUpload.jade', 'css!style/user/photoUpload', 'jfileupload/jquery.iframe-transport', 'jfileupload/jquery.fileupload'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, loadImage, jade) {
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

			this.auth = globalVM.repository['m/common/auth'];
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
			if (this.auth.loggedIn()) {
				storage.user(user, function (data) {
					if (data) {
						this.u = data.vm;

						ko.applyBindings(globalVM, this.$dom[0]);

						// Initialize the jQuery File Upload widget:
						this.$dom.find('#fileupload').fileupload();
						this.$dom.find('#fileupload').fileupload('option', {
							url: 'http://' + P.settings.server.domain() + ':' + P.settings.server.uport() + '/',
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
				globalVM.func.showContainer(this.$container, function () {
					this.$dom.find('#fileupload').fileupload('enable');
				}, this);
			}

			this.showing = true;
		},
		hide: function () {
			this.$dom.find('#fileupload').fileupload('disable');
			$(document).off('dragenter').off('dragleave');
			if (this.options.popup) {
				this.$container.removeClass('show');
			} else {
				globalVM.func.hideContainer(this.$container);
			}
			this.showing = false;
		},
		localDestroy: function (destroy) {
			this.hide();
			this.$dom.find('#fileupload').fileupload('destroy');
			destroy.call(this);
		},


		startFile: function (file) {
			file.ext.jqXHR = file.ext.data.submit();
		},
		cancelFile: function (file) {
			if (this.fileUploaded.hasOwnProperty(file.ext.file)) {
				socket.emit('removePhoto', file.ext.file);
				delete this.fileUploaded[file.ext.file];
			} else if (file.ext.jqXHR && file.ext.jqXHR.abort) {
				file.ext.jqXHR.abort();
			}
			this.destroyFile(file);
		},
		destroyFile: function (file) {
			this.fileList.remove(file);
		},


		onFileAdd: function (e, data) {
			var options = this.fileOptions,
				optionsPlugin = (this.$fileupload.data('blueimp-fileupload') || this.$fileupload.data('fileupload') || {}).options,
				files = data.files;

			this.$dom.find('.addfiles_area')[0].classList.remove('dragover');
			$.each(files, function (index, file) {
				file.ext = {
					uid: Utils.randomString(7),
					data: data,
					humansize: Utils.format.fileSize(file.size),
					progress: ko.observable(0),
					uploading: ko.observable(false),
					uploaded: ko.observable(false),
					valid: true,
					error: ko.observable(false),
					hasPreview: ko.observable(options.previewMaxSize && file.size < options.previewMaxSize),
					msg: ko.observable(''),
					msgCss: ko.observable('')
				};

				this.validate(file, options);

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
			if (file.ext.hasPreview()) {
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
				receivedFiles = result.files || [],
				toSaveArr = [];

			receivedFiles.forEach(function (receivedFile, index, array) {
				if (receivedFile.name && receivedFile.file) {

					data.files.forEach(function (file, index) {
						if (file.name === receivedFile.name) {
							file.ext.file = receivedFile.file;
							file.ext.jqXHR = null;
							delete file.ext.jqXHR;
							this.fileUploaded[receivedFile.file] = file;
							window.setTimeout(function () {
								file.ext.uploading(false);
								file.ext.uploaded(true);
								this.setMessage(file, 'Successfully loaded', 'success');
							}.bind(this), 500);
						}
					}, this);

					toSaveArr.push(_.pick(receivedFile, 'file', 'type', 'size'));
				}
			}, this);

			if (toSaveArr.length > 0) {
				socket.emit('createPhoto', toSaveArr);
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
			var progress = parseInt(data.loaded / data.total * 100, 10);
			data.files.forEach(function (file, index) {
				file.ext.progress(progress);
			}, this);
			e = data = progress = null;
		},
		onFileProgressAll: function (e, data) {
			//console.log('onFileProgressAll ', data.loaded, data.total);
			this.fileProgressAll(parseInt(data.loaded / data.total * 100, 10));
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
			if (this.fileList.length > options.maxFiles) {
				file.ext.error(true);
				file.ext.valid = false;
				this.setMessage(file, 'Maximum number of files exceeded', 'error');
			}
			// Files are accepted if either the file type or the file name matches against the acceptFileTypes regular expression,
			// as only browsers with support for the File API report the type:
			if (!(options.acceptTypes.test(file.type) || options.acceptTypes.test(file.name))) {
				file.ext.error(true);
				file.ext.valid = false;
				this.setMessage(file, 'Filetype not allowed', 'error');
			}
			if (options.maxSize && file.size > options.maxSize) {
				file.ext.error(true);
				file.ext.valid = false;
				this.setMessage(file, 'File is too big', 'error');
			}
			if (typeof file.size === 'number' && file.size < options.minSize) {
				file.ext.error(true);
				file.ext.valid = false;
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
					var node = that.$dom.find('.forcanvas[data-fileuid="' + file.ext.uid + '"]');
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

			file.ext.msg(text);
			file.ext.msgCss(css);

			text = type = css = null;
		}
	});
});
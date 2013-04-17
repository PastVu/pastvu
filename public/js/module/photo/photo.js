/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'm/Photo', 'm/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo', 'bs/bootstrap-tooltip', 'bs/bootstrap-popover', 'bs/bootstrap-dropdown', 'bs/bootstrap-multiselect', 'knockout.bs', 'jquery-plugins/scrollto', 'jquery-plugins/imgareaselect'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
	'use strict';

	/**
	 * Редактирование содержимого элементов с помошью contenteditable
	 * Inspired by https://groups.google.com/forum/#!topic/knockoutjs/Mh0w_cEMqOk
	 * @type {Object}
	 */
	ko.bindingHandlers.cEdit = {
		init: function (element, valueAccessor, allBindingsAccessor) {
		},
		update: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var obj = ko.utils.unwrapObservable(valueAccessor()),
				$element = $(element);

			$element.text(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val);

			if (obj.edit) {
				if (!$element.attr('contenteditable')) {
					$element
						.css({display: ''})
						.attr('contenteditable', "true")
						.on('blur', function () {
							console.log('blur');
							var modelValue = obj.val,
								elementValue = $.trim($element.text());

							$element.text(elementValue);
							if (ko.isWriteableObservable(modelValue)) {
								if (elementValue === modelValue()) {
									checkForCap();
								} else {
									modelValue(elementValue);
								}
							}
						})
						.on('focus', function () {
							console.log('focus');
							$element.removeClass('cap');
							if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
								$element.html('&nbsp;');
							}
						});
					checkForCap();
				} else {
					checkForCap();
				}
			} else {
				if ($element.attr('contenteditable') === 'true') {
					$element.off('blur').off('focus').removeAttr('contenteditable').removeClass('cap');
				}
				if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
					$element.css({display: 'none'});
				}
			}

			function checkForCap() {
				if (obj.edit && obj.cap && _.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
					$element.addClass('cap');
					$element.text(obj.cap);
				} else {
					$element.removeClass('cap');
				}
			}
		}
	};

	return Cliche.extend({
		jade: jade,
		create: function () {
			var _this = this;
			this.auth = globalVM.repository['m/auth'];
			this.p = Photo.vm(Photo.def.full);

			this.photoSrc = ko.observable('');
			this.photoLoading = ko.observable(true);
			this.photoLoadContainer = null;

			this.userRibbon = ko.observableArray();
			this.userRibbonLeft = [];
			this.userRibbonRight = [];
			this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

			this.IOwner = ko.computed(function () {
				return this.auth.iAm.login() === this.p.user.login();
			}, this);
			this.IAdmin = ko.computed(function () {
				return P.settings.LoggedIn() && this.auth.iAm.role_level() >= 0;
			}, this);

			this.canBeEdit = ko.computed(function () {
				return this.IOwner() || this.IAdmin();
			}, this);

			this.canBeApprove = ko.computed(function () {
				return this.p.fresh() && this.IAdmin();
			}, this);

			this.canBeDisable = ko.computed(function () {
				return !this.p.fresh() && this.IAdmin();
			}, this);

			this.canBeRemove = ko.computed(function () {
				return this.IAdmin();
			}, this);

			this.canBeConvert = ko.computed(function () {
				return this.IAdmin();
			}, this);

			this.edit = ko.observable(undefined);

			this.msg = ko.observable('');
			this.msgCss = ko.observable('');

			this.msgByStatus = ko.computed(function () {
				if (this.edit()) {
					this.setMessage('Photo is in edit mode. Please fill in the underlying fields and save the changes', 'warn');
					//globalVM.pb.publish('/top/message', ['Photo is in edit mode. Please fill in the underlying fields and save the changes', 'warn']);
				} else if (this.p.fresh()) {
					this.setMessage('Photo is new. Administrator must approve it', 'warn');
				} else if (this.p.disabled()) {
					this.setMessage('Photo is disabled by Administrator. Only You and other Administrators can see and edit it', 'warn');
				} else if (this.p.del()) {
					this.setMessage('Photo is deleted by Administrator', 'warn');
				} else {
					this.setMessage('', 'muted');
				}
			}, this);

			this.userInfo = ko.computed(function () {
				return _.template(
					'Added by <a target="_self" href="/u/${ login }">${ name }</a> at ${ stamp }<br/>Viewed today ${ sd } times, week ${ sw } times, total ${ sa } times',
					{ login: this.p.user.login(), name: this.p.user.fullName(), stamp: moment(this.p.loaded()).format('D MMMM YYYY'), sd: this.p.stats_day(), sw: this.p.stats_week(), sa: this.p.stats_all()}
				);
			}, this);

			this.ws = ko.observable(Photo.def.full.ws);
			this.hs = ko.observable(Photo.def.full.hs);
			this.hscale = ko.observable(true);
			this.thumbW = ko.observable('0px');
			this.thumbH = ko.observable('0px');
			this.thumbM = ko.observable('1px');
			this.userThumbN = ko.observable(3);

			this.mapVM = null;
			var mapDeffered = new $.Deferred();
			this.mapReadyPromise = mapDeffered.promise();
			this.childs = [
				{
					module: 'm/map/map',
					container: '.photoMap',
					options: {embedded: true, editing: this.edit(), deferredWhenReady: mapDeffered},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
						this.mapVM = vm;
						this.exe(false);
					}
				}
			];

			this.convertOptions = ko.observableArray([
				/*{vName: 'Origin', id: 'origin'}, */{vName: 'Standard', vId: 'standard'},
				{vName: 'Thumb', vId: 'thumb'},
				{vName: 'Midi', vId: 'midi'},
				{vName: 'Mini', vId: 'mini'},
				{vName: 'Micro', vId: 'micro'},
				{vName: 'Micros', vId: 'micros'}
			]);
			this.selectedOpt = ko.observableArray([]);
			this.$dom.find('#convertSelect').multiselect({
				buttonClass: 'btn-strict',
				buttonWidth: 'auto', // Default
				buttonText: function (options) {
					if (options.length === 0) {
						return 'Convert variants <b class="caret"></b>';
					} else if (options.length === _this.convertOptions().length) {
						return 'All variants selected <b class="caret"></b>';
					} else if (options.length > 2) {
						return options.length + ' variants selected <b class="caret"></b>';
					} else {
						var selected = '';
						options.each(function () {
							selected += $(this).text() + ', ';
						});
						return selected.substr(0, selected.length - 2) + ' <b class="caret"></b>';
					}
				}
			});

			this.comments = ko.observableArray();
			this.commentsUsers = {};
			this.commentsWait = ko.observable(false);
			this.commentsInViewport = false;

			this.scrollTimeout = null;
			this.commentsRecieveTimeout = null;
			this.commentsViewportTimeout = null;

			this.$comments = this.$dom.find('.photoComments');

			this.handleViewScrollBind = this.viewScrollHandle.bind(this);
			this.scrollToFragCommentBind = this.scrollToFragComment.bind(this);
			this.checkCommentsInViewportBind = this.commentsCheckInViewport.bind(this);
			this.recieveCommentsBind = this.commentsRecieve.bind(this);


			this.commentExe = ko.observable(false);
			this.commentReplyingTo = ko.observable(0);
			this.commentNestingMax = 9;
			this.commentReplyBind = this.commentReply.bind(this);
			this.commentReplyToBind = this.commentReplyTo.bind(this);
			this.commentReplyClickBind = this.commentReplyClick.bind(this);
			this.commentRemoveBind = this.commentRemove.bind(this);
			this.commentSendBind = this.commentSend.bind(this);
			this.commentCancelBind = this.commentCancel.bind(this);

			this.commentFraging = ko.observable(false);
			this.commentFragArea = null;
			this.commentFragBind = this.commentFrag.bind(this);
			this.commentFragCreateBind = this.commentFragCreate.bind(this);
			this.commentFragDeleteBind = this.commentFragDelete.bind(this);

			ko.applyBindings(globalVM, this.$dom[0]);

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			// Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно, а последующие будут выстреливать сразу
			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});
			this.routeHandlerDebounced();

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			this.subscriptions.edit = this.edit.subscribe(this.editHandler, this);
			this.subscriptions.login = this.auth.iAm.login.subscribe(this.loginHandler, this);
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.subscriptions.hscale = this.hscale.subscribe(this.sizesCalcPhoto, this);
			this.subscriptions.year = this.p.year.subscribe(function (val) {
				var v = Number(val);

				if (!v || isNaN(v)) {
					//Если значение не парсится, ставим дефолтное
					v = Photo.def.full.year;
				} else {
					//Убеждаемся, что оно в допустимом интервале
					v = Math.min(Math.max(v, 1826), 2000);
				}

				if (String(val) !== String(v)) {
					//Если мы поправили значение, то перезаписываем его
					this.p.year(v);
				} else if (v > parseInt(this.p.year2(), 10)) {
					this.p.year2(v);
				}
			}, this);
			this.subscriptions.year2 = this.p.year2.subscribe(_.debounce(function (val) {
				var v = Number(val);

				if (!v || isNaN(v)) {
					//Если значение не парсится, ставим дефолтное
					v = Photo.def.full.year;
				} else {
					//Убеждаемся, что оно в допустимом интервале и не мене year
					v = Math.min(Math.max(v, this.p.year()), 2000);
				}

				if (String(val) !== String(v)) {
					this.p.year2(v);
				}
			}, 400), this);

		},
		show: function () {
			if (this.showing) {
				return;
			}
			this.$container.fadeIn(400, function () {
				var $wrap = this.$dom.find('.photoImgWrap');
				$wrap
					.on('mouseenter', 'a.photoFrag', function (evt) {
						var frag = $(evt.target),
							fragOffset = frag.offset(),
							fragPosition = frag.position(),
							fragWidth = frag.width(),
							$comment = $(".media[data-cid=" + frag.attr('data-cid') + "]"),
							placement;

						if ($comment.length === 1) {
							$wrap.addClass('fragHover');
							$wrap.find('.photoImg').imgAreaSelect({
								classPrefix: 'photoFragAreaShow imgareaselect',
								x1: fragPosition.left, y1: fragPosition.top, x2: fragPosition.left + fragWidth + 2, y2: fragPosition.top + frag.height() + 2,
								zIndex: 1,
								parent: $wrap, disable: true
							});

							if (fragOffset.left + fragWidth / 2 < 150) {
								placement = 'right';
							} else if ($(evt.delegateTarget).width() - fragOffset.left - fragWidth / 2 < 150) {
								placement = 'left';
							} else {
								placement = 'bottom';
							}
							frag
								.popover({title: $comment.find('.author').html(), content: $comment.find('.commentText').html(), placement: placement, html: true, delay: 0, animation: false, trigger: 'manual'})
								.popover('show');
						}
					}.bind(this))
					.on('mouseleave', '.photoFrag', function (evt) {
						var frag = $(evt.target);
						frag.popover('destroy');
						$wrap.find('.photoImg').imgAreaSelect({remove: true});
						$wrap.removeClass('fragHover');
					});
			}.bind(this));
			this.sizesCalc();
			this.showing = true;
		},
		hide: function () {
			this.$container.css('display', '');
			this.showing = false;
			globalVM.pb.publish('/top/message', ['', 'muted']);
		},

		sizesCalc: function () {
			var windowW = P.window.w(),
				rightPanelW = this.$dom.find('.rightPanel').width(),
				thumbW,
				thumbH,
				thumbWV1 = 84,
				thumbWV2 = 90,
				thumbMarginMin = 1,
				thumbMargin,
				thumbNMin = 3,
				thumbNV1,
				thumbNV2;

			thumbNV1 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV1 + thumbMarginMin) >> 0);
			thumbNV2 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV2 + thumbMarginMin) >> 0);

			if (thumbNV1 === thumbNV2) {
				thumbW = thumbWV2;
			} else {
				thumbW = thumbWV1;
			}

			thumbH = thumbW / 1.5 >> 0;
			thumbMargin = (rightPanelW - thumbNV1 * thumbW) / (thumbNV1 - 1) >> 0;

			this.thumbW(thumbW + 'px');
			this.thumbH(thumbH + 'px');
			this.thumbM(thumbMargin + 'px');
			this.userThumbN(thumbNV1);

			this.sizesCalcPhoto();

			this.applyUserRibbon();

			windowW = rightPanelW = thumbW = thumbH = null;
		},
		sizesCalcPhoto: function () {
			var maxWidth = this.$dom.find('.photoPanel').width(),
				maxHeight,
				hscale = this.hscale(),
				ws = this.p.ws(),
				hs = this.p.hs(),
				aspect = ws / hs,
				fragSelection;

			if (hscale) {
				maxHeight = P.window.h() - this.$dom.find('.photoImgRow').offset().top - 47 >> 0;
				if (hs > maxHeight) {
					hs = maxHeight;
					ws = hs * aspect >> 0;
				}
			}

			if (ws > maxWidth) {
				hs = maxWidth / aspect >> 0;
				ws = hs * aspect >> 0;
			}

			this.ws(ws);
			this.hs(hs);

			if (this.commentFragArea instanceof $.imgAreaSelect) {
				fragSelection = this.commentFragArea.getSelection();
				this.commentFragDelete();
				this.commentFragCreate(fragSelection);
			}
		},
		stateChange: function (data, event) {
			var state = $(event.currentTarget).attr('data-state');
			if (state && this[state]) {
				this[state](!this[state]());
			}
		},

		routeHandler: function () {
			var cid = Number(globalVM.router.params().photo),
				hl = globalVM.router.params().hl,
				appHistory = globalVM.router.getFlattenStack('/p/', ''),
				offset = globalVM.router.offset;

			this.toComment = this.toFrag = undefined;
			window.clearTimeout(this.scrollTimeout);

			if (hl) {
				if (hl.indexOf('comment-') === 0) {
					this.toComment = parseInt(hl.substr(8), 10) || undefined;
				} else if (hl.indexOf('frag-') === 0) {
					this.toFrag = parseInt(hl.substr(5), 10) || undefined;
				}
			}

			if (this.p && Utils.isType('function', this.p.cid) && this.p.cid() !== cid) {
				this.photoLoading(true);

				this.comments([]);
				this.commentsUsers = {};
				this.addMeToCommentsUsers();
				this.commentsWait(false);
				this.commentsInViewport = false;
				this.viewScrollOff();
				window.clearTimeout(this.commentsRecieveTimeout);
				window.clearTimeout(this.commentsViewportTimeout);

				storage.photo(cid, function (data) {
					if (data) {
						this.originData = data.origin;
						this.p = Photo.vm(data.origin, this.p, true);

						if (this.photoLoadContainer) {
							this.photoLoadContainer.off('load').off('error');
						}
						this.photoLoadContainer = $(new Image())
							.on('load', this.onPhotoLoad.bind(this))
							.on('error', this.onPhotoError.bind(this))
							.attr('src', this.p.sfile());


						// Вызываем обработчик изменения фото (this.p)
						this.changePhotoHandler();

						// Если фото новое и пользователь - владелец, открываем его на редактирование
						this.edit(this.p.fresh() && this.IOwner());

						this.show();
						this.getUserRibbon(7, 7, this.applyUserRibbon, this);

						if (this.p.ccount() > 0) {
							this.commentsWait(true);
							this.viewScrollOn();
							this.commentsViewportTimeout = window.setTimeout(this.checkCommentsInViewportBind, this.p.ccount() > 30 ? 500 : 300);
						}
					}
				}, this, this.p);
			} else if (this.toFrag || this.toComment) {
				this.scrollTimeout = window.setTimeout(this.scrollToFragCommentBind, 50);
			}

		},
		loginHandler: function (v) {
			this.addMeToCommentsUsers();
			// После логина/логаута перезапрашиваем ленту фотографий пользователя
			this.getUserRibbon(7, 7, this.applyUserRibbon, this);
		},
		editHandler: function (v) {
			if (v) {
				$.when(this.mapReadyPromise).done(this.mapEditOn.bind(this));
			} else {
				$.when(this.mapReadyPromise).done(this.mapEditOff.bind(this));
			}
		},
		mapEditOn: function () {
			this.mapVM.editPointOn();
		},
		mapEditOff: function () {
			this.mapVM.editPointOff();
		},
		// Обработчик изменения фото
		changePhotoHandler: function () {
			$.when(this.mapReadyPromise).done(this.setMapPoint.bind(this));
		},
		// Установить точку на карту
		setMapPoint: function () {
			this.mapVM.setPoint(this.p);
		},

		editSave: function (/*data, event*/) {
			if (this.canBeEdit()) {
				if (!this.edit()) {
					this.edit(true);
				} else {
					this.exe(true);
					this.p.geo(this.mapVM.getPointGeo());
					this.save(function (data) {
						if (!data.error) {
							this.edit(false);
							this.setMapPoint();
						} else {
							window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
						}
						this.exe(false);
					}, this);

				}
			}
		},
		editCancel: function (data, event) {
			if (this.canBeEdit() && this.edit()) {
				this.cancel();
				this.edit(false);
			}
		},
		setApprove: function (data, event) {
			if (this.canBeApprove()) {
				this.exe(true);
				socket.once('approvePhotoResult', function (data) {
					if (data && !data.error) {
						this.p.fresh(false);
						this.originData.fresh = false;
					} else {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
					}
					this.exe(false);
				}.bind(this));
				socket.emit('approvePhoto', this.p.cid());
			}
		},
		toggleDisable: function (data, event) {
			if (this.canBeDisable()) {
				this.exe(true);
				socket.once('disablePhotoResult', function (data) {
					if (data && !data.error) {
						this.p.disabled(data.disabled || false);
						this.originData.disabled = data.disabled || false;
					} else {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
					}
					this.exe(false);
				}.bind(this));
				socket.emit('disablePhoto', this.p.cid());
			}
		},

		remove: function (data, event) {
			if (!this.canBeRemove()) {
				return false;
			}

			var that = this;

			this.exe(true);
			window.noty(
				{
					text: 'The photo will be removed permanently.<br>Confirm the delete operation?',
					type: 'confirm',
					layout: 'center',
					modal: true,
					force: true,
					animation: {
						open: {height: 'toggle'},
						close: {},
						easing: 'swing',
						speed: 500
					},
					buttons: [
						{addClass: 'btn-strict btn-strict-danger', text: 'Ok', onClick: function ($noty) {
							// this = button element
							// $noty = $noty element
							if ($noty.$buttons && $noty.$buttons.find) {
								$noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
							}

							socket.once('removePhotoCallback', function (data) {
								$noty.$buttons.find('.btn-strict-danger').remove();
								var okButton = $noty.$buttons.find('button')
									.attr('disabled', false)
									.removeClass('disabled')
									.off('click');

								if (data && !data.error) {
									this.p.del(true);
									this.originData.del = true;

									$noty.$message.children().html('Photo successfully removed');

									okButton.text('Ok (4)').on('click', function () {
										document.location.href = '/u/' + this.p.user.login() + '/photo';
									}.bind(this));

									Utils.timer(
										5000,
										function (timeleft) {
											okButton.text('Ok (' + timeleft + ')');
										},
										function () {
											okButton.trigger('click');
										}
									);
								} else {
									$noty.$message.children().html(data.message || 'Error occurred');
									okButton.text('Close').on('click', function () {
										$noty.close();
										this.exe(false);
									}.bind(this));
								}
							}.bind(that));
							socket.emit('removePhoto', that.p.cid());

						}},
						{addClass: 'btn-strict', text: 'Cancel', onClick: function ($noty) {
							$noty.close();
							that.exe(false);
						}}
					]
				}
			);
		},
		save: function (cb, ctx) {
			var target = _.pick(ko_mapping.toJS(this.p), 'geo', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author'),
				key;

			for (key in target) {
				if (target.hasOwnProperty(key)) {
					if (!_.isUndefined(this.originData[key]) && _.isEqual(target[key], this.originData[key])) {
						delete target[key];
					} else if (_.isUndefined(this.originData[key]) && _.isEqual(target[key], Photo.def.full[key])) {
						delete target[key];
					}
				}
			}

			if (target.geo) {
				target.geo.reverse();
			}
			if (Utils.getObjectPropertyLength(target) > 0) {
				target.cid = this.p.cid();
				socket.once('savePhotoResult', function (data) {
					if (data && !data.error) {
						if (target.geo) {
							target.geo.reverse();
						}
						_.assign(this.originData, target);
					}
					if (cb) {
						cb.call(ctx, data);
					}
				}.bind(this));
				socket.emit('savePhoto', target);
			} else {
				if (cb) {
					cb.call(ctx, {message: 'Nothing to save'});
				}
			}
		},
		cancel: function () {
			_.forEach(this.originData, function (item, key) {
				if (Utils.isType('function', this.p[key]) && this.p[key]() !== item) {
					this.p[key](item);
				}
			}.bind(this));
		},

		toConvert: function (data, event) {
			if (!this.canBeConvert() || this.selectedOpt().length === 0) {
				return false;
			}
			this.exe(true);
			socket.once('convertPhotosResult', function (data) {
				if (data && !data.error) {
					window.noty({text: data.message || 'OK', type: 'success', layout: 'center', timeout: 1000, force: true});
				} else {
					window.noty({text: (data && data.message) || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
				}
				this.exe(false);
			}.bind(this));
			socket.emit('convertPhotos', [
				{file: this.p.file(), variants: this.selectedOpt()}
			]);
		},

		getUserRibbon: function (left, right, cb, ctx) {
			socket.once('takeUserPhotosAround', function (data) {
				if (!data || data.error) {
					console.error('While loading user ribbon: ', data.message || 'Error occurred');
				} else {
					var left = [],
						right = [];
					if (data.left && data.left.length > 0) {
						data.left.reverse();
						data.left.forEach(function (item) {
							var existItem = _.find(this.userRibbonLeft, function (element) {
								return element.cid === item.cid;
							});
							if (existItem) {
								left.push(existItem);
							} else {
								Photo.factory(item, 'base', 'mini');
								left.push(item);
							}
						}, this);
					}
					this.userRibbonLeft = left;
					if (data.right && data.right.length > 0) {
						data.right.forEach(function (item) {
							var existItem = _.find(this.userRibbonRight, function (element) {
								return element.cid === item.cid;
							});
							if (existItem) {
								right.push(existItem);
							} else {
								Photo.factory(item, 'base', 'mini');
								right.push(item);
							}
						}, this);
					}
					this.userRibbonRight = right;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserPhotosAround', {cid: this.p.cid(), limitL: left, limitR: right});
		},
		applyUserRibbon: function (cb, ctx) {
			var n = this.userThumbN(),
				nLeft = Math.min(Math.max(Math.ceil(n / 2), n - this.userRibbonRight.length), this.userRibbonLeft.length),
				newRibbon = this.userRibbonLeft.slice(-nLeft);

			Array.prototype.push.apply(newRibbon, this.userRibbonRight.slice(0, n - nLeft));
			this.userRibbon(newRibbon);
			n = nLeft = newRibbon = null;
		},
		addMeToCommentsUsers: function () {
			if (P.settings.LoggedIn() && this.commentsUsers[this.auth.iAm.login()] === undefined) {
				this.commentsUsers[this.auth.iAm.login()] = {
					login: this.auth.iAm.login(),
					avatar: this.auth.iAm.avatarth(),
					name: this.auth.iAm.fullName()
				}
			}
		},

		viewScrollOn: function () {
			$(window).on('scroll', this.handleViewScrollBind);
		},
		viewScrollOff: function () {
			$(window).off('scroll', this.handleViewScrollBind);
		},
		viewScrollHandle: function () {
			if (!this.commentsInViewport) {
				this.commentsCheckInViewport();
			}
		},
		commentsCheckInViewport: function () {
			window.clearTimeout(this.commentsViewportTimeout);

			var cTop = this.$comments.offset().top,
				wTop = $(window).scrollTop(),
				wFold = $(window).height() + wTop;

			if (this.toComment || this.p.frags().length > 0 || cTop < wFold) {
				this.commentsInViewport = true;
				this.viewScrollOff();
				this.commentsGet();
			}
		},
		commentsGet: function () {
			window.clearTimeout(this.commentsRecieveTimeout);
			this.commentsRecieveTimeout = window.setTimeout(this.recieveCommentsBind, this.p.ccount() > 30 ? 750 : 400);
		},
		commentsRecieve: function () {
			var cid = this.p.cid();
			socket.once('takeCommentsPhoto', function (data) {
				this.commentsWait(false);
				if (!data) {
					console.error('Noe comments data recieved');
				} else {
					if (data.error) {
						console.error('While loading comments: ', data.message || 'Error occurred');
					} else if (data.cid !== cid) {
						console.info('Comments recieved for another photo ' + data.cid);
					} else {
						this.commentsUsers = _.assign(data.users, this.commentsUsers);
						this.comments(this.commentsTreeBuild(data.comments));
						this.scrollTimeout = window.setTimeout(this.scrollToFragCommentBind, 100);
					}
				}
			}.bind(this));
			socket.emit('giveCommentsPhoto', {cid: cid});
		},
		commentsTreeBuild: function (arr) {
			var i = -1,
				len = arr.length,
				hash = {},
				comment,
				results = [];

			while (++i < len) {
				comment = arr[i];
				if (comment.level < this.commentNestingMax) {
					comment.comments = ko.observableArray();
				}
				if (comment.level > 0) {
					hash[comment.parent].comments.push(comment);
				} else {
					results.push(comment);
				}
				hash[comment.cid] = comment;
			}

			return results;
		},
		scrollToFragComment: function () {
			var element;
			if (this.toFrag) {
				element = $('.photoFrag[data-cid="' + this.toFrag + '"]');
			} else if (this.toComment) {
				element = $('.media[data-cid="' + this.toComment + '"]');
			}
			if (element && element.length === 1) {
				$('.photoFrag.hl').removeClass('hl');
				$('.media.hl').removeClass('hl');
				$(window).scrollTo(element, {duration: 400, onAfter: function (elem, params) {
					$(elem).addClass('hl');
				}});
			}
		},

		commentReplyClick: function (data, event) {
			this.commentActivate($(event.target).closest('.commentAdd'));
		},
		commentReply: function () {
			this.commentActivate($('ul.media-list > .media.commentAdd').last(), 600);
		},
		commentReplyTo: function (data, event) {
			var cid,
				$media,
				$root;

			if (data.level < this.commentNestingMax) {
				$media = $(event.target).closest('li.media');
				cid = data.cid;
			} else if (data.level === this.commentNestingMax) {
				$media = $($(event.target).parents('li.media')[1]);
				cid = Number($media.attr('data-cid')) || 0;
			}
			this.commentReplyingTo(cid);
			$root = $media.find('.commentAdd').last();

			this.commentActivate($root, 400);
		},
		commentFrag: function (data, event) {
			var $root = $(event.target).closest('.commentAdd'),
				$wrap = $('.photoImgWrap');

			this.commentFraging(true);
			$root.addClass('hasContent');

			$(window).scrollTo($wrap, {duration: 400, onAfter: function () {
				this.commentFragCreate();
			}.bind(this)});
		},
		commentFragCreate: function (selections) {
			if (!this.commentFragArea) {
				var $parent = this.$dom.find('.photoImgWrap'),
					ws = this.p.ws(), hs = this.p.hs(),
					ws2, hs2;

				if (!selections) {
					ws2 = ws / 2 >> 0;
					hs2 = hs / 2;
					selections = {x1: ws2 - 50, y1: hs2 - 50, x2: ws2 + 50, y2: hs2 + 50};
				}

				this.commentFragArea = $parent.find('.photoImg').imgAreaSelect(_.assign({
					classPrefix: 'photoFragAreaSelect imgareaselect',
					imageWidth: ws, imageHeight: hs,
					minWidth: 30, minHeight: 30,
					handles: true, parent: $parent, persistent: true, instance: true
				}, selections));
			}
			this.commentFraging(true);
		},
		commentFragDelete: function () {
			if (this.commentFragArea instanceof $.imgAreaSelect) {
				this.commentFragArea.remove();
				this.$dom.find('.photoImg').removeData('imgAreaSelect');
				this.commentFragArea = null;
			}
			this.commentFraging(false);
		},
		commentActivate: function (root, scrollDuration) {
			if (P.settings.LoggedIn() && (root instanceof jQuery) && root.length === 1) {
				var input = root.find('.commentInput');

				root.addClass('hasFocus');
				input
					.off('keyup').off('blur')
					.on('keyup', _.debounce(this.commentAddKeyup.bind(this), 300))
					.on('blur', _.debounce(this.commentAddBlur.bind(this), 200));
				this.commentCheckInViewport(root, scrollDuration, function () {
					input.focus();
				});
			}
		},
		commentAddKeyup: function (evt) {
			var input = $(evt.target),
				content = $.trim(input.val()),
				root = input.closest('.commentAdd');

			root[content ? 'addClass' : 'removeClass']('hasContent');
			this.commentCheckInputHeight(root, input);
		},
		commentAddBlur: function (evt) {
			var input = $(evt.target),
				content = $.trim(input.val()),
				root = input.closest('.commentAdd');

			input.off('keyup').off('blur');
			if (!content && !this.commentFraging()) {
				root.removeClass('hasContent');
				input.height('auto');
			}
			root.removeClass('hasFocus');
		},
		commentCheckInViewport: function (root, scrollDuration, cb) {
			var btnSend = root.find('.btnCommentSend'),
				cBottom = btnSend.offset().top + btnSend.height() + 10,
				wTop = $(window).scrollTop(),
				wFold = $(window).height() + wTop;

			if (wFold < cBottom) {
				$(window).scrollTo('+=' + (cBottom - wFold) + 'px', {axis: 'y', duration: scrollDuration || 200, onAfter: function () {
					if (Utils.isType('function', cb)) {
						cb.call(this);
					}
				}.bind(this)});
			} else {
				if (Utils.isType('function', cb)) {
					cb.call(this);
				}
			}
		},
		commentCheckInputHeight: function (root, input) {
			var content = $.trim(input.val()),
				height = input.height(),
				heightScroll = (input[0].scrollHeight - 8) || height;

			if (!content) {
				input.height('auto');
			} else if (heightScroll > height) {
				input.height(heightScroll);
				this.commentCheckInViewport(root);
			}
		},
		commentCancel: function (data, event) {
			var root = $(event.target).closest('.commentAdd'),
				input = root.find('.commentInput');

			input.off('keyup').off('blur').val('').height('auto');
			root.removeClass('hasContent').removeClass('hasFocus');
			this.commentReplyingTo(0);
		},
		commentSend: function (data, event) {
			var root = $(event.target).closest('.commentAdd'),
				input = root.find('.commentInput'),
				content = $.trim(input.val()),
				fragSelection,
				dataSend;

			if (_.isEmpty(content)) {
				return;
			}
			dataSend = {
				photo: this.p.cid(),
				txt: content
			};
			if (Utils.isType('number', data.cid)) {
				dataSend.parent = data.cid;
				dataSend.level = (data.level || 0) + 1;
			}
			if (this.commentFragArea instanceof $.imgAreaSelect) {
				fragSelection = this.commentFragArea.getSelection(false);
				dataSend.fragObj = {
					l: 100 * fragSelection.x1 / this.p.ws(),
					t: 100 * fragSelection.y1 / this.p.hs(),
					w: 100 * fragSelection.width / this.p.ws(),
					h: 100 * fragSelection.height / this.p.hs()
				};
			}

			this.commentExe(true);
			socket.once('createCommentResult', function (result) {
				if (!result) {
					window.noty({text: 'Ошибка отправки комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
				} else {
					if (result.error || !result.comment) {
						window.noty({text: result.message || 'Ошибка отправки комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
					} else {
						if (result.comment.level < this.commentNestingMax) {
							result.comment.comments = ko.observableArray();
						}
						data.comments.push(result.comment);
						this.p.ccount(this.p.ccount() + 1);
						if (Utils.isType('object', result.frag)) {
							this.p.frags.push(ko_mapping.fromJS(result.frag));
						}

						this.commentFragDelete();
						this.commentCancel(data, event);
					}
				}
				this.commentExe(false);
			}.bind(this));
			socket.emit('createComment', dataSend);
		},
		commentRemove: function (data, event) {
			var _this = this,
				root = $(event.target).closest('.media'),
				cid = Number(data.cid);

			root.addClass('hlRemove');

			window.noty(
				{
					text: 'Ветка комментариев будет удалена вместе с содержащимися в ней фрагментами без возможности восстановления<br>Подтверждаете операцию удаления?',
					type: 'confirm',
					layout: 'center',
					modal: true,
					force: true,
					animation: {
						open: {height: 'toggle'},
						close: {},
						easing: 'swing',
						speed: 500
					},
					buttons: [
						{addClass: 'btn-strict btn-strict-danger', text: 'Да', onClick: function ($noty) {
							// this = button element
							// $noty = $noty element
							if ($noty.$buttons && $noty.$buttons.find) {
								$noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
							}

							socket.once('removeCommentResult', function (result) {
								$noty.$buttons.find('.btn-strict-danger').remove();
								var okButton = $noty.$buttons.find('button')
									.attr('disabled', false)
									.removeClass('disabled')
									.off('click');

								$noty.$message.children().html((result && result.message) || '');
								okButton.text('Close').on('click', function () {
									$noty.close();
									if (!result.error) {
										if (Utils.isType('number', result.countComments)) {
											this.p.ccount(this.p.ccount() - result.countComments);
										}
										if (Utils.isType('array', result.frags)) {
											this.p.frags(ko_mapping.fromJS({arr: result.frags}).arr());
										}
										this.commentsRecieve();
									} else {
										root.removeClass('hlRemove');
									}

								}.bind(this));

							}.bind(_this));
							socket.emit('removeComment', cid);
						}},
						{addClass: 'btn-strict', text: 'Отмена', onClick: function ($noty) {
							root.removeClass('hlRemove');
							$noty.close();
						}}
					]
				}
			);
		},


		onPhotoLoad: function (event) {
			var img = event.target;
			// Если реальные размеры фото не соответствуют тем что в базе, используем реальные
			if (Utils.isType('number', img.width) && this.p.ws() !== img.width) {
				this.p.ws(img.width);
			}
			if (Utils.isType('number', img.height) && this.p.hs() !== img.height) {
				this.p.hs(img.height);
			}
			this.photoSrc(this.p.sfile());
			this.sizesCalcPhoto();
			this.photoLoadContainer = null;
			this.photoLoading(false);
		},
		onPhotoError: function (event) {
			this.photoSrc('');
			this.photoLoadContainer = null;
			this.photoLoading(false);
		},
		onImgLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
			data = event = null;
		},
		onAvatarError: function (data, event) {
			$(event.target).attr('src', '/img/caps/avatar.png');
			data = event = null;
		},
		onThumbLoad: function (data, event) {
			$(event.target).parents('.photoTile').css({visibility: 'visible'});
			data = event = null;
		},
		onThumbError: function (data, event) {
			var $parent = $(event.target).parents('.photoTile');
			event.target.style.visibility = 'hidden';
			if (data.conv) {
				$parent.addClass('photoConv');
			} else if (data.convqueue) {
				$parent.addClass('photoConvqueue');
			} else {
				$parent.addClass('photoError');
			}
			$parent.animate({opacity: 1});
			data = event = $parent = null;
		},
		setMessage: function (text, type) {
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

			this.msg(text);
			this.msgCss(css);

			text = type = css = null;
		}
	});
});
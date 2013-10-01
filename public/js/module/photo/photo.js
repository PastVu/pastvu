/*global define:true, ga:true*/
/**
 * Модель страницы фотографии
 */
define(['underscore', 'underscore.string', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'model/Photo', 'model/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo', 'bs/bootstrap-tooltip', 'bs/bootstrap-popover', 'bs/bootstrap-dropdown', 'bs/bootstrap-multiselect', 'knockout.bs', 'jquery-plugins/imgareaselect'], function (_, _s, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
	'use strict';
	var $window = $(window),
		imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

	return Cliche.extend({
		jade: jade,
		create: function () {
			var _this = this;

			this.auth = globalVM.repository['m/common/auth'];
			this.p = Photo.vm(Photo.def.full);
			this.binded = false;

			this.photoSrc = ko.observable('');
			this.photoLoading = ko.observable(true);
			this.photoLoadContainer = null;

			this.userRibbon = ko.observableArray();
			this.ribbonUserLeft = [];
			this.ribbonUserRight = [];
			this.nearestRibbon = ko.observableArray();
			this.nearestRibbonOrigin = [];

			this.rnks = ko.observable(''); //Звания пользователя в виде готового шаблона

			this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

			this.can = ko_mapping.fromJS({
				edit: false,
				disable: false,
				remove: false,
				approve: false,
				convert: false
			});

			this.IOwner = this.co.IOwner = ko.computed(function () {
				return this.auth.iAm.login() === this.p.user.login();
			}, this);

			this.canBeApprove = this.co.canBeApprove = ko.computed(function () {
				return this.p.fresh() && this.can.approve();
			}, this);

			this.canBeDisable = this.co.canBeDisable = ko.computed(function () {
				return !this.p.fresh() && !this.p.del() && this.can.disable();
			}, this);

			this.edit = ko.observable(undefined);

			this.msg = ko.observable('');
			this.msgCss = ko.observable('');

			this.msgByStatus = this.co.msgByStatus = ko.computed(function () {
				if (this.edit()) {
					this.setMessage('Фото в режиме редактирования. Внесите необходимую информацию и сохраните изменения', 'warn'); //Photo is in edit mode. Please fill in the underlying fields and save the changes
					//globalVM.pb.publish('/top/message', ['Photo is in edit mode. Please fill in the underlying fields and save the changes', 'warn']);
				} else if (this.p.fresh()) {
					if (!this.p.ready()) {
						this.setMessage('Новая фотография. Должна быть заполнена и отправлена модератору для публикации', 'warn'); //Photo is new. Administrator must approve it
					} else {
						this.setMessage('Новая фотография. Ожидает подтверждения модератором', 'warn'); //Photo is new. Administrator must approve it
					}
				} else if (this.p.disabled()) {
					this.setMessage('Фотография деактивирована администрацией. Только вы и модераторы можете видеть ёё и редактировать', 'warn'); //Photo is disabled by Administrator. Only You and other Administrators can see and edit it
				} else if (this.p.del()) {
					this.setMessage('Фотография удалена', 'error'); //Photo is deleted by Administrator
				} else {
					this.setMessage('', 'muted');
				}
			}, this);

			var userInfoTpl = _.template('Добавил${ addEnd } <a href="/u/${ login }" ${ css }>${ name }</a>, ${ stamp }');
			this.userInfo = this.co.userInfo = ko.computed(function () {
				return userInfoTpl(
					{login: this.p.user.login(), name: this.p.user.disp(), css: this.p.user.online() ? 'class="online"' : '', addEnd: this.p.user.sex && this.p.user.sex() === 'f' ? 'а' : '', stamp: moment(this.p.ldate()).format('D MMMM YYYY')}
				);
			}, this);

			this.ws = ko.observable(Photo.def.full.ws);
			this.hs = ko.observable(Photo.def.full.hs);
			this.hscalePossible = ko.observable(false);
			this.hscaleTumbler = ko.observable(true);
			this.mapH = ko.observable('500px');
			this.thumbW = ko.observable('0px');
			this.thumbH = ko.observable('0px');
			this.thumbM = ko.observable('1px');
			this.thumbN = ko.observable(4);
			this.thumbNUser = ko.observable(3);

			this.convertOptions = ko.observableArray([
				{vName: 'Origin', vId: 'a'},
				{vName: 'Standard', vId: 'd'},
				{vName: 'Thumb', vId: 'h'},
				{vName: 'Midi', vId: 'm'},
				{vName: 'Mini', vId: 'q'},
				{vName: 'Micro', vId: 's'},
				{vName: 'Micros', vId: 'x'}
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


			this.scrollTimeout = null;

			this.$comments = this.$dom.find('.commentsContainer');

			this.descFocusBind = this.inputFocus.bind(this);
			this.descLabelClickBind = this.inputLabelClick.bind(this);
			this.scrollToBind = this.scrollTo.bind(this);

			this.fraging = ko.observable(false);
			this.fragArea = null;

			this.mapVM = null;
			this.mapModuleDeffered = new $.Deferred();
			this.mapModulePromise = this.mapModuleDeffered.promise();
			this.childs = [
				{
					module: 'm/comment/comments',
					container: '.commentsContainer',
					options: {type: 'photo', autoShowOff: true},
					ctx: this,
					callback: function (vm) {
						this.commentsVM = this.childModules[vm.id] = vm;
						this.routeHandler();
					}
				}
			];

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			this.routeHandlerDebounced = _.debounce(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			this.subscriptions.edit = this.edit.subscribe(this.editHandler, this);
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.subscriptions.hscaleTumbler = this.hscaleTumbler.subscribe(this.sizesCalcPhoto, this);
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

			globalVM.func.showContainer(this.$container, function () {
				this.fragAreasActivate();
			}, this);
			this.sizesCalc();
			this.showing = true;
		},
		hide: function () {
			this.$dom.find('.photoImgWrap').off();
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
			//globalVM.pb.publish('/top/message', ['', 'muted']);
		},

		makeBinding: function () {
			var mapReadyDeffered;

			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);

				mapReadyDeffered = new $.Deferred();
				renderer(
					[
						{
							module: 'm/map/map',
							container: '.photoMap',
							options: {embedded: true, editing: this.edit(), point: this.genMapPoint(), dfdWhenReady: mapReadyDeffered},
							ctx: this,
							callback: function (vm) {
								this.mapVM = this.childModules[vm.id] = vm;
								$.when(mapReadyDeffered.promise()).done(function () {
									this.mapModuleDeffered.resolve();
								}.bind(this));
							}
						}
					],
					{
						parent: this,
						level: this.level + 2 //Чтобы не удалился модуль комментариев
					}
				);

				this.binded = true;
				this.show();
			}
		},

		routeHandler: function () {
			var cid = Number(globalVM.router.params().cid),
				hl = globalVM.router.params().hl;

			this.toComment = this.toFrag = undefined;
			window.clearTimeout(this.scrollTimeout);

			if (hl) {
				if (hl.indexOf('comment-') === 0) {
					this.toComment = hl.substr(8) || undefined; //Навигация к конкретному комментарию
				} else if (hl.indexOf('comments') === 0) {
					this.toComment = true; //Навигация к секции комментариев
				} else if (hl.indexOf('frag-') === 0) {
					this.toFrag = parseInt(hl.substr(5), 10) || undefined; //Навигация к фрагменту
				}
			}

			if (this.p && Utils.isType('function', this.p.cid) && this.p.cid() !== cid) {
				this.photoLoading(true);

				this.commentsVM.deactivate();

				storage.photo(cid, function (data) {
					var editMode; // Если фото новое и пользователь - владелец, открываем его на редактирование
					if (data) {
						this.originData = data.origin;
						this.p = Photo.vm(data.origin, this.p, true);
						this.can = ko_mapping.fromJS(data.can, this.can);

						Utils.title.setTitle({title: this.p.title()});

						editMode = this.can.edit() && this.IOwner() && this.p.fresh() && !this.p.ready();

						if (this.photoLoadContainer) {
							this.photoLoadContainer.off('load').off('error');
						}
						this.photoLoadContainer = $(new Image())
							.on('load', this.onPhotoLoad.bind(this))
							.on('error', this.onPhotoError.bind(this))
							.attr('src', this.p.sfile());

						this.processRanks(this.p.user.ranks());
						this.getUserRibbon(3, 4, this.applyUserRibbon, this);
						this.getNearestRibbon(8, this.applyNearestRibbon, this);

						// В первый раз точку передаем сразу в модуль карты, в следующие устанавливам методами
						if (this.binded) {
							$.when(this.mapModulePromise).done(this.setMapPoint.bind(this));
						}

						this.edit(editMode);
						if (!this.binded) {
							this.makeBinding();
						}
						ga('send', 'pageview');
					}
				}, this, this.p);
			} else if (this.toFrag || this.toComment) {
				this.scrollTimeout = window.setTimeout(this.scrollToBind, 50);
			}
		},

		loggedInHandler: function () {
			// После логина перезапрашиваем ленту фотографий пользователя
			this.getUserRibbon(3, 4, this.applyUserRibbon, this);
			// Запрашиваем разрешенные действия для фото
			storage.photoCan(this.p.cid(), function (data) {
				if (!data.error) {
					this.can = ko_mapping.fromJS(data.can, this.can);
				}
			}, this);
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},

		editHandler: function (v) {
			if (v) {
				$.when(this.mapModulePromise).done(this.mapEditOn.bind(this));
				this.commentsVM.hide();
			} else {
				$.when(this.mapModulePromise).done(this.mapEditOff.bind(this));
				this.commentsActivate();
			}
		},

		mapEditOn: function () {
			this.mapVM.editPointOn();
		},
		mapEditOff: function () {
			this.mapVM.editPointOff();
		},

		// Установить фото для точки на карте
		setMapPoint: function () {
			this.mapVM.setPoint(this.genMapPoint());
		},
		genMapPoint: function () {
			return _.pick(this.p, 'geo', 'year', 'dir', 'title');
		},

		//Вызывается после рендеринга шаблона информации фото
		tplAfterRender: function (elements, vm) {
			if (vm.edit()) {
				vm.descSetEdit();
			}
		},

		//Пересчитывает все размеры, зависимые от размера окна
		sizesCalc: function () {
			var rightPanelW = this.$dom.find('.rightPanel').width(),
				userRibbonW = rightPanelW - 85,

				thumbW,
				thumbH,

				thumbWV1 = 84, //Минимальная ширина thumb
				thumbWV2 = 90, //Максимальная ширина thumb
				thumbMarginMin = 1,
				thumbMarginMax = 7,
				thumbMargin,
				thumbNMin = 2,
				thumbNV1,
				thumbNV2,
				thumbNV1User,
				thumbNV2User;

			thumbNV1 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV1 + thumbMarginMin) >> 0);
			thumbNV2 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV2 + thumbMarginMin) >> 0);
			thumbNV1User = Math.max(thumbNMin, (userRibbonW + thumbMarginMin) / (thumbWV1 + thumbMarginMin) >> 0);
			thumbNV2User = Math.max(thumbNMin, (userRibbonW + thumbMarginMin) / (thumbWV2 + thumbMarginMin) >> 0);

			if (thumbNV1 === thumbNV2) {
				thumbW = thumbWV2;
			} else {
				thumbW = thumbWV1;
			}

			thumbH = thumbW / 1.5 >> 0;
			thumbMargin = Math.min((rightPanelW - thumbNV1 * thumbW) / (thumbNV1 - 1) >> 0, thumbMarginMax);

			this.mapH(Math.max(350, Math.min(700, P.window.h() - this.$dom.find('.photoMap').offset().top - 84)) + 'px');
			this.thumbW(thumbW + 'px');
			this.thumbH(thumbH + 'px');
			this.thumbM(thumbMargin + 'px');
			this.thumbN(thumbNV1);
			this.thumbNUser(thumbNV1User);

			this.sizesCalcPhoto();
			this.applyUserRibbon();
			this.applyNearestRibbon();
		},
		//Пересчитывает размер фотографии
		sizesCalcPhoto: function () {
			var maxWidth = this.$dom.find('.photoPanel').width() - 24 >> 0,
				maxHeight = P.window.h() - this.$dom.find('.photoImgRow').offset().top - 47 >> 0,
				ws = this.p.ws(),
				hs = this.p.hs(),
				aspect = ws / hs,
				fragSelection;

			// Подгоняем по максимальной ширине
			if (ws > maxWidth) {
				ws = maxWidth;
				hs = Math.round(ws / aspect);
			}

			// Если устанавливаемая высота больше максимальной высоты,
			// то делаем возможным hscale и при влюченном тумблере hscale пересчитываем высоту и ширину
			if (hs > maxHeight) {
				this.hscalePossible(true);
				if (this.hscaleTumbler()) {
					hs = maxHeight;
					ws = Math.round(hs * aspect);
				}
			} else {
				this.hscalePossible(false);
			}

			this.ws(ws);
			this.hs(hs);

			if (this.fragArea instanceof $.imgAreaSelect) {
				fragSelection = this.fragAreaSelection();
				this.fragAreaDelete();
				this.fragAreaCreate(fragSelection);
			}
		},

		stateChange: function (data, event) {
			var state = $(event.currentTarget).attr('data-state');
			if (state && this[state]) {
				this[state](!this[state]());
			}
		},
		toolsNumFormat: function (num) {
			if (num < 100) {
				return num;
			} else if (num < 1000) {
				return (num / 100 >> 0) + 'h';
			} else {
				return (num / 1000 >> 0) + 'k';
			}
		},

		descSetEdit: function () {
			var $root = this.$dom.find('.photoDesc'),
				$input = $root.find('.descInput'),
				content = Utils.txtHtmlToInput(this.p.desc());

			if (content) {
				$input.val(Utils.txtHtmlToInput(this.p.desc()));
				//Задаем высоту textarea под контент
				$root.addClass('hasContent');
			}
			this.inputCheckHeight($root, $input);

			this.sourceEditingOrigin = Utils.txtHtmlToInput(this.p.source());
			this.p.source(this.sourceEditingOrigin);
		},
		//Фокус на поле ввода активирует его редактирование
		inputFocus: function (data, event) {
			this.descActivate($(event.target).closest('.photoInfo'));
		},
		//Клик на лэйбл активирует редактирование
		inputLabelClick: function (data, event) {
			this.descActivate($(event.target).closest('.photoInfo'), null, true);
		},
		descActivate: function (root, scrollDuration, focus) {
			var input = root.find('.descInput');

			root.addClass('hasFocus');
			input
				.off('keyup').off('blur')
				.on('keyup', _.debounce(this.inputKeyup.bind(this), 300))
				.on('blur', _.debounce(this.inputBlur.bind(this), 200));
			this.inputCheckInViewport(root, scrollDuration, function () {
				if (focus) {
					input.focus();
				}
			});
		},
		//Отслеживанием ввод, чтобы подгонять input под высоту текста
		inputKeyup: function (evt) {
			var $input = $(evt.target),
				$root = $input.closest('.photoInfo'),
				content = $.trim($input.val());

			this.descEditingChanged = true;
			$root[content ? 'addClass' : 'removeClass']('hasContent');
			this.inputCheckHeight($root, $input);
		},
		inputBlur: function (evt) {
			var $input = $(evt.target),
				$root = $input.closest('.photoInfo'),
				content = $.trim($input.val());

			$input.off('keyup').off('blur');
			if (!content && !this.fraging()) {
				$root.removeClass('hasContent');
				$input.height('auto');
			}
			if (!content) {
				$input.val('');
			}
			$root.removeClass('hasFocus');
		},
		inputCheckHeight: function (root, input) {
			var content = $.trim(input.val()),
				height = input.height(),
				heightScroll = (input[0].scrollHeight) || height;

			if (!content) {
				input.height('auto');
			} else if (heightScroll > height) {
				input.height(heightScroll);
				this.inputCheckInViewport(input);
			}
		},
		inputCheckInViewport: function (input, scrollDuration, cb) {
			var cBottom = input.offset().top + input.height() + 10,
				wTop = $window.scrollTop(),
				wFold = $window.height() + wTop;

			if (wFold < cBottom) {
				$window.scrollTo('+=' + (cBottom - wFold) + 'px', {axis: 'y', duration: scrollDuration || 200, onAfter: function () {
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

		editSave: function (/*data, event*/) {
			if (this.can.edit()) {
				if (!this.edit()) {
					this.edit(true);
				} else {
					this.exe(true);
					this.save(function (data) {
						if (!data.error) {
							this.edit(false);

							if (this.p.fresh() && !this.p.ready()) {
								this.notifyReady();
							}
							ga('send', 'event', 'photo', 'edit', 'photo edit success');
						} else {
							window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
							ga('send', 'event', 'photo', 'edit', 'photo edit error');
						}
						this.exe(false);
					}, this);

				}
			}
		},
		editCancel: function (data, event) {
			if (this.can.edit() && this.edit()) {
				this.cancel();
				this.edit(false);
			}
		},
		setApprove: function (data, event) {
			if (this.canBeApprove()) {
				this.exe(true);
				socket.once('approvePhotoResult', function (data) {
					if (data && !data.error) {
						this.setApproveSuccess();
					} else {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
						ga('send', 'event', 'photo', 'edit', 'photo approve error');
					}
					this.exe(false);
				}.bind(this));
				socket.emit('approvePhoto', this.p.cid());
			}
		},
		setApproveSuccess: function () {
			this.p.fresh(false);
			this.originData.fresh = false;
			this.commentsActivate({checkTimeout: 100});
			ga('send', 'event', 'photo', 'approve', 'photo approve success');
		},
		toggleDisable: function (data, event) {
			if (this.canBeDisable()) {
				this.exe(true);
				socket.once('disablePhotoResult', function (data) {
					if (data && !data.error) {
						this.p.disabled(data.disabled || false);
						this.originData.disabled = data.disabled || false;
						ga('send', 'event', 'photo', data.disabled ? 'disabled' : 'enabled', 'photo ' + (data.disabled ? 'disabled' : 'enabled') + ' success');
					} else {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
						ga('send', 'event', 'photo', data.disabled ? 'disabled' : 'enabled', 'photo ' + (data.disabled ? 'disabled' : 'enabled') + ' error');
					}
					this.exe(false);
				}.bind(this));
				socket.emit('disablePhoto', {cid: this.p.cid(), disable: !this.p.disabled()});
			}
		},

		notifyReady: function () {
			window.noty(
				{
					text: 'Чтобы фотография была опубликованна, необходимо оповестить об этом модераторов<br>Вы можете сделать это в любое время, нажав кнопку «Готово»',
					type: 'information',
					layout: 'topRight',
					force: true,
					timeout: 6000,
					closeWith: ['click'],
					animation: {
						open: {height: 'toggle'},
						close: {height: 'toggle'},
						easing: 'swing',
						speed: 500
					}
				}
			);
		},
		askForGeo: function (cb, ctx) {
			window.noty(
				{
					text: 'Вы не указали координаты снимка<br><br>Сделать это можно, кликнув в режиме редактирования по карте справа и перемещая появившийся маркер<br><br>Без координаты фотография попадет в раздел «Где это?»',
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
						{addClass: 'btn-strict', text: 'Продолжить', onClick: function ($noty) {
							cb.call(this);
							$noty.close();
						}.bind(this)},
						{addClass: 'btn-strict btn-strict-success', text: 'Указать координату', onClick: function ($noty) {
							this.edit(true);
							$noty.close();
						}.bind(this)}
					]
				}
			);
		},

		remove: function (data, event) {
			if (!this.can.remove()) {
				return false;
			}

			var that = this;

			this.exe(true);
			window.noty(
				{
					text: 'Фотография будет удалена<br>Подтвердить операцию?',
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
									ga('send', 'event', 'photo', (!this.IOwner() && this.p.fresh() ? 'decline' : 'delete'), 'photo ' + (!this.IOwner() && this.p.fresh() ? 'decline' : 'delete') + ' success');
								} else {
									$noty.$message.children().html(data.message || 'Error occurred');
									okButton.text('Close').on('click', function () {
										$noty.close();
										this.exe(false);
									}.bind(this));
									ga('send', 'event', 'photo', (!this.IOwner() && this.p.fresh() ? 'decline' : 'delete'), 'photo ' + (!this.IOwner() && this.p.fresh() ? 'decline' : 'delete') + ' error');
								}
							}.bind(that));
							socket.emit('removePhoto', that.p.cid());

						}},
						{addClass: 'btn-strict', text: 'Отмена', onClick: function ($noty) {
							$noty.close();
							that.exe(false);
						}}
					]
				}
			);
		},
		save: function (cb, ctx) {
			var target = _.pick(ko_mapping.toJS(this.p), 'geo', 'dir', 'title', 'year', 'year2', 'address', 'author'),
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

			if (this.descEditingChanged) {
				target.desc = this.$dom.find('.descInput').val();
			}

			if (this.p.source() !== this.sourceEditingOrigin) {
				target.source = this.p.source();
			}

			if (Utils.getObjectPropertyLength(target) > 0) {
				target.cid = this.p.cid();
				socket.once('savePhotoResult', function (result) {
					if (result && !result.error && result.saved) {
						if (target.geo !== undefined) {
							this.getNearestRibbon(8, this.applyNearestRibbon, this);
							if (Array.isArray(target.geo)) {
								target.geo.reverse();
							}
						}
						if (this.descEditingChanged) {
							if (result.data.desc) {
								target.desc = result.data.desc;
								this.p.desc(result.data.desc);
							} else {
								delete target.desc; //Если desc не вернулся, значит он не был изменен
							}
							delete this.descEditingChanged;
						}
						if (target.source) {
							if (result.data.source) {
								target.source = result.data.source;
								this.p.source(result.data.source);
							} else {
								delete target.source; //Если source не вернулся, значит он не был изменен
							}
							delete this.sourceEditingOrigin;
						}
						_.assign(this.originData, target);
					}
					if (cb) {
						cb.call(ctx, result);
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
			ko_mapping.fromJS(this.originData, this.p);
			delete this.descEditingChanged;
			delete this.sourceEditingOrigin;
		},
		setReady: function (data, event) {
			if (this.p.fresh() && !this.p.ready()) {
				if (_.isEmpty(this.p.geo())) {
					this.askForGeo(this.sendReady, this);
				} else {
					this.sendReady();
				}
			}
		},
		sendReady: function (data, event) {
			this.exe(true);
			socket.once('readyPhotoResult', function (data) {
				if (data && !data.error) {
					if (data.published) {
						this.setApproveSuccess();
					} else {
						this.p.ready(true);
						this.originData.ready = true;
					}
					ga('send', 'event', 'photo', 'ready', 'photo ready success');
				} else {
					window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					ga('send', 'event', 'photo', 'ready', 'photo ready error');
				}
				this.exe(false);
			}.bind(this));
			socket.emit('readyPhoto', this.p.cid());
		},

		toConvert: function (data, event) {
			if (!this.can.convert() || this.selectedOpt().length === 0) {
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
				{cid: this.p.cid(), variants: this.selectedOpt()}
			]);
		},

		//Стандартная обработка поступающего массива лент фотографий,
		//если пришедшая фотография есть, она вставляется в новый массив
		processRibbonItem: function (incomingArr, targetArr) {
			var resultArr = [],
				i,
				item,
				itemExistFunc = function (element) {
					return element.cid === item.cid;
				};

			for (i = 0; i < incomingArr.length; i++) {
				item = incomingArr[i];
				resultArr.push(_.find(targetArr, itemExistFunc) || Photo.factory(item, 'base', 'q'));
			}
			return resultArr;
		},

		//Берем ленту ближайших фотографий к текущей в галерее пользователя
		getUserRibbon: function (left, right, cb, ctx) {
			socket.once('takeUserPhotosAround', function (data) {
				if (!data || data.error) {
					console.error('While loading user ribbon: ' + (data && data.message || 'Error occurred'));
				} else {
					this.ribbonUserLeft = this.processRibbonItem(data.left.reverse(), this.ribbonUserLeft);
					this.ribbonUserRight = this.processRibbonItem(data.right, this.ribbonUserRight);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveUserPhotosAround', {cid: this.p.cid(), limitL: left, limitR: right});
		},
		applyUserRibbon: function () {
			var n = this.thumbNUser(),
				nLeft = Math.min(Math.max(Math.ceil(n / 2), n - this.ribbonUserRight.length), this.ribbonUserLeft.length),
				newRibbon = this.ribbonUserLeft.slice(-nLeft);

			Array.prototype.push.apply(newRibbon, this.ribbonUserRight.slice(0, n - nLeft));
			this.userRibbon(newRibbon);
		},

		//Берем ленту ближайщих на карте либо к текущей (если у неё есть координата), либо к центру карты
		getNearestRibbon: function (limit, cb, ctx) {
			if (this.nearestForCenterDebounced) {
				//Если уже есть обработчик на moveend, удаляем его
				this.mapVM.map.off('moveend', this.nearestForCenterDebounced, this);
				this.nearestForCenterDebounced = null;
			}

			if (this.p.geo()) {
				//Если у фото есть координата - берем ближайшие для неё
				this.receiveNearestRibbon(this.p.geo(), limit, cb, ctx);
			} else {
				//Если у фото нет координат - берем ближайшие к центру карты
				$.when(this.mapModulePromise).done(function () {
					//Сразу берем, если зашли в первый раз
					this.nearestForCenter(limit, cb, ctx);
					//Дебаунс для moveend карты
					this.nearestForCenterDebounced = _.debounce(function () {
						this.nearestForCenter(limit, cb, ctx);
					}, 1500);
					//Вешаем обработчик перемещения
					this.mapVM.map.on('moveend', this.nearestForCenterDebounced, this);
				}.bind(this));
			}
		},
		nearestForCenter: function (limit, cb, ctx) {
			var latlng = this.mapVM.map.getCenter();
			this.receiveNearestRibbon([latlng.lat, latlng.lng], limit, cb, ctx);
		},
		receiveNearestRibbon: function (geo, limit, cb, ctx) {
			socket.once('takeNearestPhotos', function (data) {
				if (!data || data.error) {
					console.error('While loading nearest ribbon: ' + (data && data.message || 'Error occurred'));
				} else {
					if (data.photos.length && data.photos[0].cid === this.p.cid()) {
						//первая фотография скорее всего окажется текущей - отсекаем её
						data.photos.splice(0, 1);
					}
					this.nearestRibbonOrigin = this.processRibbonItem(data.photos, this.nearestRibbonOrigin);
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveNearestPhotos', {geo: geo, limit: limit});
		},
		applyNearestRibbon: function () {
			this.nearestRibbon(this.nearestRibbonOrigin.slice(0, this.thumbN()));
		},

		processRanks: function (ranks) {
			var rank,
				rnks = '',
				r;

			for (r = 0; r < ranks.length; r++) {
				rank = globalVM.ranks[ranks[r]];
				if (rank) {
					rnks += '<img class="rank" src="' + rank.src + '" title="' + rank.title + '">';
				}
			}
			this.rnks(rnks);
		},

		/**
		 * COMMENTS
		 */
		commentsActivate: function (options) {
			//Активируем, если фото не новое и не редактируется
			if (!this.edit() && !this.p.fresh()) {
				this.commentsVM.activate(
					{cid: this.p.cid(), count: this.p.ccount(), count_new: this.p.ccount_new(), subscr: this.p.subscr(), nocomments: this.p.nocomments()},
					_.defaults(options || {}, {instant: !!this.toComment || this.p.frags().length > 0, checkTimeout: this.toComment ? 100 : (this.p.ccount() > 30 ? 500 : 300)}),
					function () {
						//На случай наличия параметра подсветки фрагментов или комментариев вызываем scrollTo, после окончания receive
						window.setTimeout(this.scrollToBind, 150);
					},
					this
				);
			}
		},

		scrollToPhoto: function (duration, cb, ctx) {
			$window.scrollTo(this.$dom.find('.photoImgWrap'), {duration: duration || 400, onAfter: function () {
				if (Utils.isType('function', cb)) {
					cb.call(ctx);
				}
			}});
		},
		scrollTo: function () {
			if (this.toFrag) {
				this.commentsVM.highlightOff();
				this.scrollToFrag(this.toFrag);
			} else if (this.toComment) {
				this.highlightFragOff();
				this.commentsVM.scrollTo(this.toComment);
			}
			this.toComment = this.toFrag = undefined;
		},
		scrollToFrag: function (frag) {
			var $element = $('.photoFrag[data-cid="' + frag + '"]');

			if ($element && $element.length === 1) {
				this.highlightFragOff();
				$window.scrollTo($element, {duration: 400, onAfter: function () {
					this.highlightFrag(frag);
				}.bind(this)});
			}
			return $element;
		},
		highlightFrag: function (frag) {
			this.$dom.find('.photoFrag[data-cid="' + frag + '"]').addClass('hl');
		},
		highlightFragOff: function () {
			this.$dom.find('.photoFrag.hl').removeClass('hl');
		},

		commentCountIncrement: function (delta) {
			this.originData.ccount = this.originData.ccount + delta;
			this.p.ccount(this.originData.ccount);
		},
		setNoComments: function (val) {
			this.originData.nocomments = val;
			this.p.nocomments(val);
		},
		setSubscr: function (val) {
			this.originData.subscr = val;
			this.p.subscr(val);
		},


		fragAreasActivate: function () {
			var $wrap = this.$dom.find('.photoImgWrap');
			$wrap
				.on('mouseenter', 'a.photoFrag', function (evt) {
					var frag = $(evt.target),
						fragOffset = frag.offset(),
						fragPosition = frag.position(),
						fragWidth = frag.width(),
						$comment = this.$dom.find(".media[data-cid=" + frag.attr('data-cid') + "]"),
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
		},
		fragAreaCreate: function (selections) {
			if (!this.fragArea) {
				var $parent = this.$dom.find('.photoImgWrap'),
					ws = this.p.ws(), hs = this.p.hs(),
					ws2, hs2;

				if (!selections) {
					ws2 = ws / 2 >> 0;
					hs2 = hs / 2;
					selections = {x1: ws2 - 50, y1: hs2 - 50, x2: ws2 + 50, y2: hs2 + 50};
				}

				this.fragArea = $parent.find('.photoImg').imgAreaSelect(_.assign({
					classPrefix: 'photoFragAreaSelect imgareaselect',
					imageWidth: ws, imageHeight: hs,
					minWidth: 30, minHeight: 30,
					handles: true, parent: $parent, persistent: true, instance: true
				}, selections));
			}
			this.fraging(true);
		},
		fragAreaDelete: function () {
			if (this.fragArea instanceof $.imgAreaSelect) {
				this.fragArea.remove();
				this.$dom.find('.photoImg').removeData('imgAreaSelect');
				this.fragArea = null;
			}
			this.fraging(false);
		},
		fragAreaSelection: function (flag) {
			var result;
			if (this.fragArea instanceof $.imgAreaSelect) {
				result = this.fragArea.getSelection(flag);
			}
			return result;
		},
		fragAreaObject: function () {
			var selection,
				result;
			selection = this.fragAreaSelection(false);
			if (selection) {
				result = {
					l: 100 * selection.x1 / this.p.ws(),
					t: 100 * selection.y1 / this.p.hs(),
					w: 100 * selection.width / this.p.ws(),
					h: 100 * selection.height / this.p.hs()
				};
			}
			return result;
		},
		fragAdd: function (frag) {
			this.p.frags.push(ko_mapping.fromJS(frag));
		},
		fragEdit: function (ccid, options) {
			var frag = this.fragGetByCid(ccid),
				ws1percent = this.p.ws() / 100,
				hs1percent = this.p.hs() / 100;

			this.fragAreaCreate(_.assign({
				x1: frag.l() * ws1percent,
				y1: frag.t() * hs1percent,
				x2: frag.l() * ws1percent + frag.w() * ws1percent,
				y2: frag.t() * hs1percent + frag.h() * hs1percent
			}, options));
		},
		fragRemove: function (ccid) {
			this.p.frags.remove(this.fragGetByCid(ccid));
		},
		fragReplace: function (frags) {
			this.p.frags(ko_mapping.fromJS({arr: frags}).arr());
		},
		fragGetByCid: function (ccid) {
			return _.find(this.p.frags(), function (frag) {
				return frag.cid() === ccid;
			});
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
			event.target.setAttribute('src', '/img/caps/avatar.png');
			data = event = null;
		},

		onPreviewLoad: function (data, event) {
			event.target.parentNode.parentNode.classList.add('showPrv');
		},
		onPreviewErr: function (data, event) {
			var $photoBox = $(event.target.parentNode),
				parent = $photoBox[0].parentNode,
				content = '';

			event.target.style.visibility = 'hidden';
			if (data.conv) {
				content = imgFailTpl({style: 'padding-top: 20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;', txt: ''});
			} else if (data.convqueue) {
				content = imgFailTpl({style: '', txt: '<i class="icon-white icon-road"></i>'});
			} else {
				content = imgFailTpl({style: 'width:24px; height:20px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;', txt: ''});
			}
			$photoBox.append(content);
			parent.classList.add('showPrv');
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
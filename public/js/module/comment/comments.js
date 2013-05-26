/*global define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'underscore.string', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'model/Photo', 'model/storage', 'text!tpl/comment/comments.jade', 'css!style/comment/comments', 'bs/bootstrap-tooltip', 'bs/bootstrap-popover', 'jquery-plugins/scrollto'], function (_, _s, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			type: 'photo'
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.type = this.options.type;
			this.cid = null;
			this.exe = ko.observable(false);

			this.comments = ko.observableArray();
			this.users = {};

			this.dataForZeroReply = {level: 0, comments: this.comments};
			this.commentReplyingToCid = ko.observable(0);
			this.commentEditingCid = ko.observable(0);
			this.commentNestingMax = 9;

			this.replyBind = this.reply.bind(this);
			this.editBind = this.edit.bind(this);
			this.removeBind = this.remove.bind(this);
			this.sendBind = this.send.bind(this);
			this.cancelBind = this.cancel.bind(this);
			this.inputClickBind = this.inputClick.bind(this);

			this.fraging = ko.observable(false);
			this.fragClickBind = this.fragClick.bind(this);
			this.fragDeleteBind = this.fragDelete.bind(this);

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}

			if (!this.options.autoShowOff) {
				this.show();
			}
		},
		show: function () {
			if (this.showing) {
				return;
			}
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			if (!this.showing) {
				return;
			}
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		loggedInHandler: function () {
			// После логина добавляем себя в комментаторы
			this.addMeToCommentsUsers();
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		setCid: function (cid) {
			this.cid = cid;
		},
		clear: function () {
			this.comments([]);
			this.users = {};
			this.addMeToCommentsUsers();
		},
		addMeToCommentsUsers: function () {
			if (this.auth.loggedIn() && this.users[this.auth.iAm.login()] === undefined) {
				this.users[this.auth.iAm.login()] = {
					login: this.auth.iAm.login(),
					avatar: this.auth.iAm.avatarth(),
					name: this.auth.iAm.fullName()
				};
			}
		},

		recieve: function (cid, cb, ctx) {
			this.cid = cid;
			socket.once('takeCommentsPhoto', function (data) {
				if (!data) {
					console.error('Noe comments data recieved');
				} else {
					if (data.error) {
						console.error('While loading comments: ', data.message || 'Error occurred');
					} else if (data.cid !== this.cid) {
						console.info('Comments recieved for another photo ' + data.cid);
					} else {
						this.users = _.assign(data.users, this.users);
						this.comments(this.treeBuild(data.comments));
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveCommentsPhoto', {cid: this.cid});
		},
		treeBuild: function (arr) {
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
		scrollTo: function (ccid) {
			var element = this.$dom.find('.media[data-cid="' + ccid + '"]');

			if (element && element.length === 1) {
				this.highlightOff();
				$(window).scrollTo(element, {duration: 400, onAfter: function () {
					this.highlight(ccid);
				}}.bind(this));
			}
			return element;
		},
		highlight: function (ccid) {
			this.$dom.find('.media[data-cid="' + ccid + '"]').addClass('hl');
		},
		highlightOff: function () {
			this.$dom.find('.media.hl').removeClass('hl');
		},

		//Активирует написание комментария нулевого уровня
		replyZero: function () {
			this.inputActivate($('ul.media-list > .media.commentAdd').last(), 600);
		},
		//Комментарий на комментарий
		reply: function (data, event) {
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
			this.commentEditingCid(0);
			this.commentReplyingToCid(cid);
			$root = $media.find('.commentAdd').last();

			this.inputActivate($root, 400);
		},
		//Клик на поле ввода или на лэйбл над ним активирует редактирование
		inputClick: function (data, event) {
			this.inputActivate($(event.target).closest('.commentAdd'));
		},
		inputActivate: function (root, scrollDuration) {
			if (this.auth.loggedIn() && (root instanceof jQuery) && root.length === 1) {
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

		fragClick: function (data, event) {
			var $root = $(event.target).closest('.commentAdd'),
				$wrap = this.$dom.find('.photoImgWrap');

			this.fraging(true);
			if (!data.frag) {
				this.commentEditingFragChanged = true;
			}
			$root.addClass('hasContent');

			$(window).scrollTo($wrap, {duration: 400, onAfter: function () {
				this.fragCreate();
			}.bind(this)});
		},
		fragCreate: function (selections) {
			this.parentModule.fragAreaCreate(selections);
			this.fraging(true);
		},
		fragDelete: function () {
			this.parentModule.fragAreaDelete();
			this.fraging(false);
			this.commentEditingFragChanged = true;
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
			if (!content && !this.fraging()) {
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

		cancel: function (data, event) {
			var root = $(event.target).closest('.commentAdd'),
				input = root.find('.commentInput');

			input.off('keyup').off('blur').val('').height('auto');
			root.removeClass('hasContent').removeClass('hasFocus');
			this.fragDelete();
			this.commentReplyingToCid(0);
			this.commentEditingCid(0);
			delete this.commentEditingFragChanged;
		},
		send: function (data, event) {
			var create = !this.commentEditingCid(),
				_this = this,
				$root = $(event.target).closest('.commentAdd'),
				$input = $root.find('.commentInput'),
				content = $input.val(), //Операции с текстом сделает сервер
				dataSend;

			if (_s.isBlank(content)) {
				$input.val('');
				return;
			}

			dataSend = {
				photo: this.cid,
				txt: content
			};

			if (this.type === 'photo') {
				dataSend.fragObj = this.parentModule.fragAreaObject();
			}

			this.exe(true);
			if (create) {
				this.commentSendCreate(data, dataSend, cb, this);
			} else {
				this.commentSendUpdate(data, dataSend, cb, this);
			}
			function cb(result) {
				_this.exe(false);
				if (result && !result.error && result.comment) {
					_this.cancel(data, event);
				}
			}
		},
		commentSendCreate: function (data, dataSend, cb, ctx) {
			//Если data.cid, значит создается дочерний комментарий
			if (Utils.isType('number', data.cid)) {
				dataSend.parent = data.cid;
				dataSend.level = (data.level || 0) + 1;
			}

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
						this.parentModule.commentCountIncrement(1);
						if (this.type === 'photo' && Utils.isType('object', result.frag)) {
							this.parentModule.fragAdd(result.frag);
						}
					}
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('createComment', dataSend);
		},
		commentSendUpdate: function (data, dataSend, cb, ctx) {
			var fragExists = this.type === 'photo' && data.frag && this.parentModule.fragGetByCid(data.cid);

			dataSend.cid = data.cid;

			//Если у комментария был фрагмент и он не изменился, то вставляем этот оригинальный фрагмент,
			//потому что даже если мы не двигали его в интерфейсе, он изменится из-за округления пикселей
			if (fragExists && !this.commentEditingFragChanged) {
				dataSend.fragObj = fragExists;
			}

			socket.once('updateCommentResult', function (result) {
				if (!result) {
					window.noty({text: 'Ошибка редактирования комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
				} else {
					if (result.error || !result.comment) {
						window.noty({text: result.message || 'Ошибка редактирования комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
					} else {
						data.txt = result.comment.txt;
						data.lastChanged = result.comment.lastChanged;

						if (this.type === 'photo' && this.commentEditingFragChanged) {
							if (Utils.isType('object', result.frag)) {
								data.frag = true;
								if (!fragExists) {
									this.parentModule.fragAdd(result.frag);
								} else {
									this.parentModule.fragRemove(data.cid);
									this.parentModule.fragAdd(result.frag);
								}
							} else if (fragExists) {
								data.frag = false;
								this.parentModule.fragRemove(data.cid);
							}
						}
					}
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('updateComment', dataSend);
		},
		txtHtmlToInput: function (txt) {
			var result = txt;

			result = result.replace(/<br\s*[\/]?>/gi, '\n'); //Заменяем <br> на \n
			result = _s.stripTags(result); //Убираем обрамляющие тэги ahref
			result = _s.unescapeHTML(result); //Возвращаем эскейпленные
			return result;
		},
		edit: function (data, event) {
			var $media = $(event.target).closest('.media'),
				cid = Number(data.cid),
				input,
				frag = this.type === 'photo' && data.frag && this.parentModule.fragGetByCid(cid); //Выбор фрагмента из this.p.frags, если он есть у комментария

			this.commentReplyingToCid(0);
			this.commentEditingCid(cid);

			this.inputActivate($media);
			input = $media.find('.commentInput:first');
			input.val(this.txtHtmlToInput(data.txt));

			//Задаем высоту textarea под контент
			$media.addClass('hasContent');
			this.commentCheckInputHeight($media, input);

			//Если есть фрагмент, делаем его редактирование
			if (frag) {
				this.commentEditingFragChanged = false;
				this.parentModule.fragEdit({
					onSelectEnd: function () {
						this.commentEditingFragChanged = true;
					}.bind(this)
				});
			}
		},
		remove: function (data, event) {
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
											this.parentModule.commentCountIncrement(-result.countComments);
										}
										if (Utils.isType('array', result.frags)) {
											this.parentModule.fragReplace(result.frags);
										}
										this.recieve();
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

		//Вызов модального окна с модулем просмотра истории комментария
		showHistory: function (cid) {
			if (!this.commentHistVM) {
				renderer(
					[
						{
							module: 'm/comment/hist',
							modal: {topic: 'История изменений комментария', closeTxt: 'Закрыть', closeFunc: function (evt) {
								this.commentHistVM.destroy();
								delete this.commentHistVM;
								evt.stopPropagation();
							}.bind(this)},
							options: {cid: cid},
							callback: function (vm) {
								this.commentHistVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 2
					}
				);
			}
		},

		onAvatarError: function (data, event) {
			$(event.target).attr('src', '/img/caps/avatar.png');
			data = event = null;
		}
	});
});
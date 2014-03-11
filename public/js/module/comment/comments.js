/*global define:true, ga:true*/
/**
 * Модель комментариев к объекту
 */
define(['underscore', 'underscore.string', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'lib/doT', 'text!tpl/comment/comments.jade', 'text!tpl/comment/cdot.jade', 'text!tpl/comment/cdotanonym.jade', 'text!tpl/comment/cdotauth.jade', 'text!tpl/comment/cdotadd.jade', 'css!style/comment/comments'], function (_, _s, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, doT, html, doTComments, doTCommentAnonym, doTCommentAuth, dotCommentAdd) {
	'use strict';

	var $window = $(window),
		commentNestingMax = 9,
		tplComments,
		tplCommentAuth,
		tplCommentAdd;

	return Cliche.extend({
		jade: html,
		options: {
			type: 'photo', //Тип объекта по умолчанию (фото, новость и т.д.)
			count: 0, //Начальное кол-во комментариев
			countNew: 0, //Начальное кол-во новых комментариев
			subscr: false, //Подписан ли пользователь на комментарии
			autoShowOff: false, //Выключить автоматический show после создания
			nocomments: false //Запрещено ли писать комментарии
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);

			this.auth = globalVM.repository['m/common/auth'];
			this.type = this.options.type;
			this.cid = null;
			this.count = ko.observable(this.options.count || 0);
			this.countNew = ko.observable(this.options.countNew || 0);
			this.subscr = ko.observable(this.options.subscr || false);
			this.nocomments = ko.observable(this.options.nocomments);

			this.loading = ko.observable(false);
			this.showTree = ko.observable(false);
			this.exe = ko.observable(false);
			this.navigating = ko.observable(false); //Флаг, что идет навигация к новому комментарию, чтобы избежать множества нажатий
			this.touch = Browser.support.touch;

			this.canModerate = ko.observable(false);
			this.canReply = ko.observable(false);
			this.canFrag = this.type === 'photo';

			this.commentsHash = {};
			this.users = {};

			this.chkSubscrClickBind = this.chkSubscrClick.bind(this);
			this.inViewportCheckBind = this.inViewportCheck.bind(this);

			this.fraging = ko.observable(false);
			this.fragClickBind = this.fragClick.bind(this);
			this.fragDeleteBind = this.fragDelete.bind(this);

			this.$cmts = $('.cmts', this.$dom);
			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
			this.subscriptions.countNew = this.countNew.subscribe(this.navCounterHandler, this);
			this.subscriptions.showTree = this.showTree.subscribe(this.showTreeHandler, this);

			if (!this.options.autoShowOff) {
				this.activate();
			}
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.eventsOn();
			this.showing = true;
		},
		hide: function () {
			if (!this.showing) {
				return;
			}
			this.deactivate();
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			if (this.cZeroDetached) {
				this.cZeroDetached.remove();
			}
			delete this.$cmts;
			destroy.call(this);
		},
		activate: function (params, options, cb, ctx) {
			var loggedIn = this.auth.loggedIn();

			if (params) {
				this.cid = params.cid;
				this.count(params.count);
				this.countNew(params.countNew);
				this.subscr(!!params.subscr);
				this.nocomments(!!params.nocomments);
				//Предварительно устанавливаем возможность комментирования, если комментарии не закрыты и пользователь зарегистрирован,
				//так как скорее всего запрос комментариев вернёт такое же право, чтобы сразу показалась кнопка Добавить
				this.canReply(loggedIn && !params.nocomments);
				this.canModerate(false); //Кнопку модерирования наоборот каждый раз прячем
			}

			//Удаляем ожидание существующей проверки и обработчик скролла,
			//если, например, вызвали эту активацию еще раз до попадания во вьюпорт
			this.viewScrollOff();
			window.clearTimeout(this.viewportCheckTimeout);
			window.clearTimeout(this.receiveTimeout);
			this.inViewport = false;

			this.loading(true);
			if (loggedIn) {
				this.addMeToCommentsUsers();
			}

			if (cb) {
				this.activatorRecieveNotice = {cb: cb, ctx: ctx};
			}

			if (this.showTree() || options && options.instant) {
				//Если дерево уже показывается или в опциях стоит немедленный показ, то запрашиваем сразу
				this.receiveTimeout = window.setTimeout(this.receive.bind(this), 100);
			} else {
				//В противном случае запрашиваем только при попадании во вьюпорт с необходимой задержкой
				this.viewportCheckTimeout = window.setTimeout(this.inViewportCheckBind, options && options.checkTimeout || 10);
			}

			if (!this.showing) {
				console.time('cc');
				//Пока данные запрашиваются в первый раз, компилим doT шаблоны для разных вариантов, если еще не скомпилили их раньше
				if (!tplComments) {
					tplComments = doT.template(doTComments, undefined, {comment: loggedIn ? doTCommentAuth : doTCommentAnonym});
				}
				if (loggedIn && !tplCommentAdd) {
					tplCommentAuth = doT.template(doTCommentAuth, _.defaults({varname: 'c,it'}, doT.templateSettings));
					tplCommentAdd = doT.template(dotCommentAdd);
				}
				console.timeEnd('cc');
				this.show();
			}
		},
		deactivate: function () {
			if (!this.showing) {
				return;
			}

			this.viewScrollOff();
			window.clearTimeout(this.viewportCheckTimeout);
			window.clearTimeout(this.receiveTimeout);
			this.inViewport = false;

			if (this.auth.loggedIn() && this.showTree()) {
				//Если зарегистрированы и уже есть комментарии, надо вынуть ответ первого уровня из dom,
				//и положить после рендеринга заново, т.к. рендеринг заменяет innerHTML блока комментариев
				this.inputZeroDetach();
				//Удаляем через jquery остальные возможные поля ввода, чтобы снять с них события
				$('.cadd', this.$cmts).remove();
			}
			this.$cmts[0].innerHTML = ''; //Просто очищаем контент, чтобы при дестрое модуля jquery не пробегал по всем элеменат в поисках данных для удаления

			this.users = {};
			this.loading(false);
			this.showTree(false);
		},
		eventsOn: function () {
			var that = this,
				getCid = function (element) {
					var cid = $(element).closest('.c').attr('id');
					if (cid) {
						return Number(cid.substr(1));
					}
				};

			this.$cmts
				.off('click') //Отключаем все повешенные события на клик, если вызываем этот метод повторно (например, при логине)
				.on('click', '.changed', function () {
					var cid = getCid(this);
					if (cid) {
						that.showHistory(cid);
					}
				});

			if (this.auth.loggedIn()) {
				this.$cmts
					.on('click', '.reply', function () {
						var cid = getCid(this);
						if (cid) {
							that.reply(cid);
						}
					})
					.on('click', '.edit', function () {
						var $c = $(this).closest('.c'),
							cid = getCid($c);
						if (cid) {
							that.edit(cid, $c);
						}
					});
			}
		},
		viewScrollOn: function () {
			if (!this.viewportScrollHandling) {
				this.inViewportCheckDebounced = _.debounce(this.inViewportCheckBind, 50);
				this.viewportScrollHandling = function () {
					this.inViewportCheckDebounced();
				}.bind(this);
				$window.on('scroll', this.viewportScrollHandling);
			}
		},
		viewScrollOff: function () {
			if (this.viewportScrollHandling) {
				$window.off('scroll', this.viewportScrollHandling);
				delete this.viewportScrollHandling;
				delete this.inViewportCheckDebounced;
			}
		},
		//Проверяем, что $container находится в видимой области экрана
		inViewportCheck: function (cb, ctx, force) {
			window.clearTimeout(this.viewportCheckTimeout);
			if (!this.inViewport) {
				var cTop = this.$container.offset().top,
					wFold = P.window.h() + (window.pageYOffset || $window.scrollTop());

				if (force || cTop < wFold) {
					this.inViewport = true;
					this.viewScrollOff();
					if (force) {
						this.receive(function () {
							if (force.cb) {
								force.cb.call(force.ctx);
							}
							if (cb) {
								cb.call(ctx);
							}
						});
					} else {
						this.receiveTimeout = window.setTimeout(this.receive.bind(this, cb || null, ctx || null), this.count() > 50 ? 750 : 400);
					}
				} else {
					//Если после первая проверка отрицательна, вешаем следующую проверку на скроллинг
					this.viewScrollOn();
				}
			}
		},

		loggedInHandler: function () {
			// После логина добавляем себя в комментаторы и заново запрашиваем комментарии (если есть новые, например)
			this.addMeToCommentsUsers();

			//Компилим шаблоны для зарегистрированного пользователя
			tplComments = doT.template(doTComments, undefined, {comment: doTCommentAuth});
			tplCommentAuth = doT.template(doTCommentAuth, _.defaults({varname: 'c,it'}, doT.templateSettings));
			tplCommentAdd = doT.template(dotCommentAdd);

			if (!this.inViewport) {
				this.inViewportCheck(null, null, true);	//Если еще не во вьюпорте, форсируем
			} else {
				this.receive(); //Если во вьюпорте, просто заново перезапрашиаваем
			}

			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		addMeToCommentsUsers: function () {
			var u, rankObj;
			if (this.users[this.auth.iAm.login()] === undefined) {
				u = {
					login: this.auth.iAm.login(),
					avatar: this.auth.iAm.avatarth(),
					disp: this.auth.iAm.disp(),
					ranks: this.auth.iAm.ranks(),
					online: true
				};
				if (u.ranks) {
					//Если есть звания у пользователя - обрабатываем их
					rankObj = {};
					rankObj[this.auth.iAm.login()] = u;
					this.usersRanks(rankObj);
				}
				this.users[this.auth.iAm.login()] = u;
			}
		},

		//Подписывается-отписывается от комментариев
		subscribe: function (data, event, byCommentCreate) {
			socket.once('subscrResult', function (result) {
				if (!result || result.error) {
					window.noty({text: result && result.message || 'Ошибка подписки', type: 'error', layout: 'center', timeout: 2000, force: true});
				} else {
					var subscrFlag = !!result.subscr,
						subscrGAction = subscrFlag ? (byCommentCreate ? 'createAutoReply' : 'create') : 'delete';

					this.parentModule.setSubscr(subscrFlag);
					this.subscr(subscrFlag);
					ga('send', 'event', 'subscription', subscrGAction, 'subscription ' + subscrGAction);
				}
			}.bind(this));
			socket.emit('subscr', {cid: this.cid, type: this.type, do: !this.subscr()});
		},

		receive: function (cb, ctx) {
			this.loading(true);
			socket.once('takeCommentsObj', function (data) {
				if (!data) {
					console.error('No comments data received');
				} else {
					if (data.error) {
						console.error('While loading comments: ', data.message || 'Error occurred');
					} else if (data.cid !== this.cid) {
						console.info('Comments received for another ' + this.type + ' ' + data.cid);
					} else {
						var canModerate = !!data.canModerate,
							canReply = !!data.canReply;

						this.usersRanks(data.users);
						this.users = _.assign(data.users, this.users);

						//Если общее кол-во изменилось пока получали, то присваиваем заново
						if (this.count() !== data.countTotal) {
							this.parentModule.commentCountIncrement(data.countTotal - this.count());
							this.count(data.countTotal);
						}
						this.countNew(data.countNew);
						this.canModerate(canModerate);
						this.canReply(canReply);

						//Отрисовываем комментарии путем замены innerHTML результатом шаблона dot
						this.renderComments(data.comments);

						//Если у пользователя есть право отвечать в комментариях этого объекта, сразу добавляем ответ нулевого уровня
						if (canReply) {
							this.inputZeroAdd();
						}
						this.showTree(true);
					}
				}
				this.loading(false);
				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
				//Уведомляем активатор (родительский модуль) о получении данных
				if (this.activatorRecieveNotice) {
					this.activatorRecieveNotice.cb.call(this.activatorRecieveNotice.ctx || window);
					delete this.activatorRecieveNotice;
				}
			}.bind(this));
			socket.emit('giveCommentsObj', {type: this.type, cid: this.cid});
		},
		renderComments: function (tree) {
			var usersHash = this.users,
				commentsPlain = [],
				commentsHash = {},
				tplResult;

			(function treeRecursive(tree) {
				var i = 0,
					len = tree.length,
					comment;

				for (; i < len; i++) {
					comment = tree[i];
					comment.user = usersHash[comment.user];
					commentsPlain.push(comment);
					commentsHash[comment.cid] = comment;
					if (comment.comments) {
						treeRecursive(comment.comments, comment);
					}
				}
			}(tree));

			this.commentsHash = commentsHash;

			console.time('tplExec');
			tplResult = tplComments({comments: commentsPlain, reply: this.canReply(), mod: this.canModerate(), fDate: Utils.format.date.relative, fDateIn: Utils.format.date.relativeIn});
			console.timeEnd('tplExec');
			console.time('tplInsert');
			this.$cmts[0].innerHTML = tplResult;
			console.timeEnd('tplInsert');
		},
		usersRanks: function (users) {
			var user,
				rank,
				i,
				r;

			for (i in users) {
				user = users[i];
				if (user !== undefined && user.ranks && user.ranks.length) {
					user.rnks = '';
					for (r = 0; r < user.ranks.length; r++) {
						rank = globalVM.ranks[user.ranks[r]];
						if (rank) {
							user.rnks += '<img class="rank" src="' + rank.src + '" title="' + rank.title + '">';
						}
					}
				}
			}
		},

		scrollTo: function (ccid) {
			var $element,
				highlight,
				elementHeight,
				scrollTopOffset,
				scrollDelta;

			if (ccid === true) {
				if (this.countNew()) {
					this.navCheckBefore(0, true);
				} else {
					$element = this.$container;
				}
			} else if (ccid === 'unread') {
				if (this.countNew()) {
					this.navCheckBefore(0, true);
				}
			} else {
				$element = $('#c' + ccid, this.$cmts);
				highlight = true;
			}
			if ($element && $element.length === 1) {
				this.highlightOff();

				//Если высота комментария меньше высоты окна, позиционируем комментарий по центру окна
				elementHeight = $element.outerHeight();
				scrollTopOffset = $element.offset().top;
				if (elementHeight < P.window.h()) {
					scrollTopOffset += elementHeight / 2 - P.window.h() / 2;
				}

				//Если скроллировать больше 2сек, т.е. 20тыс.пикс, то устанавливаем скролл без анимации
				scrollDelta = Math.abs(scrollTopOffset - (window.pageYOffset || $window.scrollTop()));
				if (scrollDelta > 20000) {
					$window.scrollTop(scrollTopOffset);
					if (highlight) {
						this.highlight(ccid);
					}
				} else {
					//Анимация - 1ms на каждые 10px, но не менее 600ms
					$window.scrollTo(scrollTopOffset, {duration: Math.max(600, scrollDelta / 10 >> 0), onAfter: function () {
						if (highlight) {
							this.highlight(ccid);
						}
					}.bind(this)});
				}
			}
			return $element;
		},
		highlight: function (ccid) {
			$('#c' + ccid, this.$cmts).addClass('hl');
		},
		highlightOff: function () {
			$('.c.hl', this.$cmts).removeClass('hl');
		},

		//Создаёт поле ввода комментария. Ответ или редактирование
		inputCreate: function (relatedComment, $cedit) {
			var $cadd,
				$input,
				$insertAfter,
				inputCid = 0,
				level = 0,
				txt,
				that = this,
				findCommentLastChild,
				setevents = function () {
					$input.on('focus', function () {
						that.inputActivate($(this).closest('.cadd'));
					});
					$('.cinputLabel', $cadd).on('click', function () {
						that.inputActivate($(this).closest('.cadd'), null, false, true);
					});
				};

			if (relatedComment) {
				if ($cedit) {
					$insertAfter = $cedit;
					level = relatedComment.level;
					txt = Utils.txtHtmlToInput(relatedComment.txt);
				} else {
					if (relatedComment.level === commentNestingMax) {
						//Если отвечают на комментарий максимального уровня, делаем так чтобы ответ был на его родительский
						relatedComment = relatedComment.parent;
					}
					findCommentLastChild = function (c) {
						return c.comments && c.comments.length ? findCommentLastChild(c.comments[c.comments.length - 1]) : c;
					};
					$insertAfter = $('#c' + findCommentLastChild(relatedComment).cid, this.$cmts);
					level = relatedComment.level + 1;
				}
				inputCid = relatedComment.cid;
			}

			$cadd = $(tplCommentAdd({user: $cedit ? relatedComment.user : this.users[this.auth.iAm.login()], cid: inputCid, level: level, type: $cedit ? 'edit' : 'reply'}));
			ko.applyBindings(this, $cadd[0]);

			if ($insertAfter && $insertAfter.length) {
				$cadd.insertAfter($insertAfter);
			} else {
				//В случае, если комментариев еще нет, $insertAfter будет пуст и надо аппендить
				this.$cmts.append($cadd);
			}

			$input = $('.cinput', $cadd);
			if (relatedComment) {
				if ($cedit) {
					$input.val(txt);
					$cadd.addClass('hasContent');
					this.inputCheckHeight($cadd, $input, txt); //Задаем высоту textarea под контент
					this.inputActivate($cadd, 400, false, true); //Активируем область ввода после inputCheckHeight без проверки вхождения во viewport, так как это тормозит chrome и не нужно в случае редактирования
					setevents();
				} else {
					this.inputActivate($cadd, 400, true, true, setevents); //Активируем область ввода
				}
			} else {
				setevents();
			}

			return $cadd;
		},
		//Удаление блока комментария
		inputRemove: function ($cadd) {
			this.fragDelete();
			ko.cleanNode($cadd[0]);
			$cadd.remove();
			delete this.commentEditingFragChanged;
		},
		//Очистка комментария, без удаления
		inputReset: function ($cadd) {
			var $input = $('.cinput', $cadd);

			window.clearTimeout(this.blurTimeout);
			$input.off('keyup').off('blur').val('').height('auto');
			$cadd.removeClass('hasContent hasFocus');
			this.fragDelete();
			delete this.commentEditingFragChanged;
		},
		//Добавляет комментарий нулевого уровня. Если его еще не существует - создаёт, если он отсоединён - вставляет
		inputZeroAdd: function () {
			if (!this.cZeroCreated) {
				this.inputCreate();
				this.cZeroCreated = true;
			} else if (this.cZeroDetached) {
				this.$cmts.append(this.cZeroDetached);
				delete this.cZeroDetached;
			}
		},
		//Отсоединяет комментарий нулевого уровня от dom
		inputZeroDetach: function () {
			if (this.cZeroCreated && !this.cZeroDetached) {
				this.cZeroDetached = $('.cadd[data-level="0"]', this.$cmts).detach();
			}
		},
		//Активирует поле ввода. Навешивает события, проверяет вхождение во вьюпорт и устанавливает фокус, если переданы соответствующие флаги
		inputActivate: function ($cadd, scrollDuration, checkViewport, focus, cb, ctx) {
			var $input = $('.cinput', $cadd);

			window.clearTimeout(this.blurTimeout);
			$cadd.addClass('hasFocus');

			$input
				.off('keyup').off('blur')
				.on('keyup', _.debounce(this.inputKeyup.bind(this), 300))
				.on('blur', this.inputBlur.bind(this));
			if (checkViewport) {
				this.inputCheckInViewport($cadd, scrollDuration, function () {
					if (focus) {
						$input.focus();
					}
					if (cb) {
						cb.call(ctx || this);
					}
				});
			} else if (focus) {
				$input.focus();
				if (cb) {
					cb.call(ctx || this);
				}
			}
		},
		//Отслеживанием ввод, чтобы подгонять input под высоту текста
		inputKeyup: function (evt) {
			var $input = $(evt.target),
				$cadd = $input.closest('.cadd'),
				content = $input.val().trim();

			$cadd[content ? 'addClass' : 'removeClass']('hasContent');
			this.inputCheckHeight($cadd, $input, content, true);
		},
		chkSubscrClick: function (data, event) {
			//После смены значения чекбокса подписки опять фокусируемся на поле ввода комментария
			this.inputActivate($(event.target).closest('.cadd'), null, false, true);
			return true; //Нужно чтобы значение поменялось
		},
		inputBlur: function (evt) {
			var $input = $(evt.target),
				$cadd = $input.closest('.cadd'),
				content = $.trim($input.val());

			$input.off('keyup').off('blur');

			this.blurTimeout = window.setTimeout(function () {
				if (!content && !this.fraging()) {
					$cadd.removeClass('hasContent');
					$input.height('auto');
				}
				if (!content) {
					$input.val('');
				}
				$cadd.removeClass('hasFocus');
			}.bind(this), 500);
		},
		//Проверяет что поле ввода включает весь контент по высоте, если нет - подгоняет по высоте
		//Если checkViewport=true, то после подгонки проверит, влезает ли поле ввода в экран
		inputCheckHeight: function ($cadd, $input, content, checkViewport) {
			if (!content) {
				$input.height('auto');
			} else {
				var height = $input.height(),
					heightScroll = ($input[0].scrollHeight - 8) || height;

				if (heightScroll > height) {
					$input.height(heightScroll);
					if (checkViewport) {
						this.inputCheckInViewport($cadd);
					}
				}
			}
		},
		//Проверяет что поле ввода нижней границей входит в экран, если нет - скроллит до нижней границе
		inputCheckInViewport: function ($cadd, scrollDuration, cb) {
			var wFold = P.window.h() + (window.pageYOffset || $window.scrollTop()),
				caddBottom = $cadd.offset().top + $cadd.outerHeight();

			if (wFold < caddBottom) {
				$window.scrollTo('+=' + (caddBottom - wFold) + 'px', {axis: 'y', duration: scrollDuration || 200, onAfter: function () {
					if (_.isFunction(cb)) {
						cb.call(this);
					}
				}.bind(this)});
			} else if (_.isFunction(cb)) {
				cb.call(this);
			}
		},

		checkInputExists: function (cid, cb, ctx) {
			var $withContent = $('.cadd.hasContent', this.$cmts);

			if ($withContent.length) {
				window.noty({text: 'У вас есть незавершенный комментарий. Отправьте или отмените его и переходите к новому', type: 'error', layout: 'center', timeout: 2000, force: true});
				return cb.call(ctx, true);
			} else {
				//Удаляем пустые открытые на редактирование поля ввода, кроме первого уровня
				_.forEach($('.cadd:not([data-level="0"])'), function (item) {
					this.inputRemove($(item));
				}, this);
				cb.call(ctx);
			}
		},

		//Активирует написание комментария нулевого уровня
		replyZero: function () {
			this.inputActivate($('.cadd', this.$cmts).last(), 600, true, true);
		},
		//Комментарий на комментарий
		reply: function (cid) {
			var commentToReply = this.commentsHash[cid],
				$cadd;

			if (commentToReply) {
				$cadd = $('.cadd[data-cid="' + cid + '"]');
				if ($cadd.length) {
					//Если мы уже отвечаем на этот комментарий, просто переходим к этому полю ввода
					this.inputActivate($cadd, 400, true, true);
				} else {
					//Проверяем, что нет других полей ввода в процессе написания
					this.checkInputExists(cid, function (err) {
						if (!err) {
							this.inputCreate(commentToReply);
						}
					}, this);
				}
			}
		},
		cancel: function (vm, event) {
			var $cadd = $(event.target).closest('.cadd'),
				cid = $cadd.data('cid'),
				type = $cadd.data('type');

			if (!cid) {
				//Если data-cid не проставлен, значит это комментарий первого уровня и его надо просто очистить, а не удалять
				vm.inputReset($cadd);
			} else {
				vm.inputRemove($cadd);
				if (type === 'edit') {
					//Если комментарий редактировался, опять показываем оригинал
					$('#c' + cid, this.$cmts).removeClass('edit');
				}
			}
		},
		send: function (vm, event) {
			if (!vm.canReply()) {
				return;
			}
			var $cadd = $(event.target).closest('.cadd'),
				$input = $('.cinput', $cadd),
				create = $cadd.data('type') === 'reply',
				cid = Number($cadd.data('cid')),
				content = $input.val(), //Операции с текстом сделает сервер
				dataInput,
				dataToSend;

			if (_s.isBlank(content)) {
				$input.val('');
				return;
			}

			if (cid) {
				dataInput = this.commentsHash[cid];
			}

			dataToSend = {
				type: vm.type, //тип объекта
				obj: vm.cid, //cid объекта
				txt: content
			};

			if (vm.canFrag) {
				dataToSend.fragObj = vm.parentModule.fragAreaObject();
			}

			vm.exe(true);
			vm[create ? 'sendCreate' : 'sendUpdate'](dataInput, dataToSend, function (result) {
				vm.exe(false);
				if (result && !result.error && result.comment) {
					//Если установлен checkbox подписки, то подписываемся
					if (!vm.subscr() && $('input.chkSubscr', $cadd).prop('checked')) {
						vm.subscribe(null, null, true);
					}

					ga('send', 'event', 'comment', create ? 'create' : 'update', 'comment ' + (create ? 'create' : 'update') + ' success');
				} else {
					ga('send', 'event', 'comment', create ? 'create' : 'update', 'comment ' + (create ? 'create' : 'update') + ' error');
				}
			}, $cadd);

		},
		sendCreate: function (parent, dataSend, cb, $cadd) {
			if (parent) {
				//Значит создается дочерний комментарий
				dataSend.parent = parent.cid;
				dataSend.level = ~~parent.level + 1;
			}

			socket.once('createCommentResult', function (result) {
				var comment,
					$c,
					$cparent;

				if (!result) {
					window.noty({text: 'Ошибка отправки комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
				} else {
					if (result.error || !result.comment) {
						window.noty({text: result.message || 'Ошибка отправки комментария', type: 'error', layout: 'center', timeout: 2000, force: true});
					} else {
						comment = result.comment;
						comment.user = this.users[comment.user];
						comment.parent = result.parent;
						comment.can.edit = true;
						comment.can.del = true;

						this.commentsHash[comment.cid] = comment;
						$c = $(tplCommentAuth(comment, {reply: this.canReply(), mod: this.canModerate(), fDate: Utils.format.date.relative, fDateIn: Utils.format.date.relativeIn}));

						if (parent) {
							if (!parent.comments) {
								parent.comments = [];
							}
							parent.comments.push(comment);

							//Если это комментарий-ответ, заменяем поле ввода новым комментарием
							$cadd.replaceWith($c);

							//Если обычный пользователь отвечает на свой комментарий, пока может его удалить,
							//то отменяем у родителя возможность удалить
							if (!this.canModerate() && parent.can.del) {
								parent.can.del = false;
								$cparent = $('#c' + parent.cid, this.$cmts);
								$('.remove', $cparent).prev('.dotDelimeter').remove();
								$('.remove', $cparent).remove();
							}
						} else {
							//Если это ответ первого уровня, сбрасываем поле ввода и вставляем перед ним результат
							$c.insertBefore($cadd);
							this.inputReset($cadd);
						}

						this.auth.setProps({ccount: this.auth.iAm.ccount() + 1}); //Инкрементим комментарии пользователя
						this.count(this.count() + 1);
						this.parentModule.commentCountIncrement(1);
						if (this.canFrag && Utils.isType('object', result.frag)) {
							this.parentModule.fragAdd(result.frag); //Если добавили фрагмент вставляем его в фотографию
						}
					}
				}

				cb(result);
			}.bind(this));
			socket.emit('createComment', dataSend);
		},
		sendUpdate: function (data, dataSend, cb) {
			if (!this.canModerate() && (!this.canReply() || !data.can.edit)) {
				return;
			}
			var fragExists = this.canFrag && data.frag && ko.toJS(this.parentModule.fragGetByCid(data.cid));

			dataSend.cid = data.cid;

			//Если у комментария был фрагмент и он не изменился, то вставляем этот оригинальный фрагмент,
			//потому что даже если мы не двигали его в интерфейсе, он изменится из-за округления пикселей
			if (fragExists && !this.commentEditingFragChanged) {
				dataSend.fragObj = _.pick(fragExists, 'cid', 'w', 'h', 't', 'l');
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

						if (this.canFrag && this.commentEditingFragChanged) {
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

				cb(result);
			}.bind(this));
			socket.emit('updateComment', dataSend);
		},
		edit: function (cid, $c) {
			if (!this.canReply()) {
				return;
			}

			this.checkInputExists(cid, function (err) {
				if (err) {
					return;
				}
				var commentToEdit = this.commentsHash[cid],
					frag;

				if (!commentToEdit) {
					return;
				}
				//Выбор фрагмента из this.p.frags. Если он есть у комментария, делаем его редактирование
				frag = this.canFrag && commentToEdit.frag && ko.toJS(this.parentModule.fragGetByCid(cid));
				if (frag) {
					this.commentEditingFragChanged = false;
					this.fraging(true);
					this.parentModule.fragEdit(cid,
						{
							onSelectEnd: function () {
								this.commentEditingFragChanged = true;
							}.bind(this)
						}
					);
				}

				//Создаем поле ввода
				this.inputCreate(commentToEdit, $c);
				//Скрываем редактируемый комментарий
				$c.addClass('edit');
			}, this);
		},
		remove: function (data, event) {
			if (!this.canModerate() && (!this.canReply() || !data.can.del)) {
				return;
			}

			var that = this,
				$cadd = $(event.target).closest('.c'),
				cid = Number($cadd.data('cid'));

			$cadd.addClass('hlRemove');

			window.noty(
				{
					text: 'Ветка комментариев будет удалена вместе с содержащимися в ней фрагментами<br>Подтверждаете операцию удаления?',
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
						{addClass: 'btn btn-danger', text: 'Да', onClick: function ($noty) {
							// this = button element
							// $noty = $noty element
							if ($noty.$buttons && $noty.$buttons.find) {
								$noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
							}

							socket.once('removeCommentResult', function (result) {
								$noty.$buttons.find('.btn-danger').remove();
								var msg,
									okButton = $noty.$buttons.find('button')
										.attr('disabled', false)
										.removeClass('disabled')
										.off('click');

								if (result && !result.error) {
									msg = 'Удалено комментариев: ' + result.countComments + ', от ' + result.countUsers + ' пользователя(ей)';
									ga('send', 'event', 'comment', 'delete', 'comment delete success', result.countComments);
								} else {
									msg = result && result.message || '';
									ga('send', 'event', 'comment', 'delete', 'comment delete error');
								}
								$noty.$message.children().html(msg);
								okButton.text('Закрыть').on('click', function () {
									$noty.close();
									if (!result.error) {
										if (Utils.isType('number', result.countComments)) {
											this.count(this.count() - result.countComments);
											this.parentModule.commentCountIncrement(-result.countComments);
										}

										if (Utils.isType('array', result.frags)) {
											this.parentModule.fragReplace(result.frags);
										}
										this.receive();
									} else {
										$cadd.removeClass('hlRemove');
									}

								}.bind(this));

							}.bind(that));
							socket.emit('removeComment', {type: that.type, cid: cid});
						}},
						{addClass: 'btn btn-primary', text: 'Отмена', onClick: function ($noty) {
							$cadd.removeClass('hlRemove');
							$noty.close();
						}}
					]
				}
			);
		},
		fragClick: function (data, event) {
			if (!this.canFrag) {
				return;
			}
			var $cadd = $(event.target).closest('.cadd');

			this.fraging(true);
			if (!data.frag) {
				this.commentEditingFragChanged = true;
			}
			$cadd.addClass('hasContent');
			this.parentModule.scrollToPhoto(400, function () {
				this.parentModule.fragAreaCreate();
			}, this);
		},
		fragDelete: function () {
			if (!this.canFrag) {
				return;
			}
			this.parentModule.fragAreaDelete();
			this.fraging(false);
			this.commentEditingFragChanged = true;
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
							options: {cid: cid, type: this.type},
							callback: function (vm) {
								this.commentHistVM = this.childModules[vm.id] = vm;
								ga('send', 'event', 'comment', 'history');
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

		setNoComments: function () {
			socket.once('setNoCommentsResult', function (data) {
				if (!data || data.error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					this.parentModule.setNoComments(data.nocomments);
					this.nocomments(data.nocomments);
				}
			}.bind(this));
			socket.emit('setNoComments', {cid: this.cid, type: this.type, val: !this.nocomments()});
		},

		navUp: function () {
			this.navCheckBefore(-1);
		},
		navDown: function () {
			this.navCheckBefore(1);
		},
		//Сначала проверяет, не навигируется ли сейчас и есть ли дерево, если нет - запросит
		navCheckBefore: function (dir, onlyFirst) {
			if (this.navigating()) {
				return;
			}
			if (this.showTree()) {
				this.nav(dir, onlyFirst);
			} else {
				this.navigating(true);
				this.inViewportCheck(function () {
					this.navigating(false);
					this.nav(dir, onlyFirst);
				}, this, true);
			}
		},
		nav: function (dir, onlyFirst) {
			var $navigator = $('.navigator', this.$dom),
				waterlineOffset,
				elementsArr = [],

				newComments = this.$cmts[0].querySelectorAll('.isnew'),
				$element,
				offset,
				i;

			if (!newComments || !newComments.length) {
				return;
			}

			if (onlyFirst) {
				$element = $(newComments[0]);
				elementsArr.push({offset: $element.offset().top, $element: $element});
			} else {
				waterlineOffset = $navigator.offset().top + $navigator.height() / 2 >> 0;
				for (i = 0; i < newComments.length; i++) {
					$element = $(newComments[i]);
					offset = $element.offset().top;

					if ((dir < 0 && offset < waterlineOffset && (offset + $element.height() < waterlineOffset)) || (dir > 0 && offset > waterlineOffset)) {
						elementsArr.push({offset: offset, $element: $element});
					}
				}
			}

			if (elementsArr.length) {
				this.navigating(true);
				elementsArr.sort(function (a, b) {
					return a.offset - b.offset;
				});
				$window.scrollTo(elementsArr[dir > 0 ? 0 : elementsArr.length - 1].offset - P.window.h() / 2 + 26 >> 0, {duration: 400, onAfter: function () {
					this.navigating(false);
				}.bind(this)});
			}
		},
		showTreeHandler: function (val) {
			this.navCounterHandler();
		},
		navCounterHandler: function () {
			if (this.countNew()) {
				if (this.showTree()) {
					this.navTxtRecalc();
					this.navScrollCounterOn();
				} else {
					//Если дерево еще скрыто, т.е. receive еще не было, просто пишем сколько новых комментариев ниже
					$('.navigator .down', this.$dom).addClass('active').find('.navTxt').attr('title', 'Следующий непрочитанный комментарий').text(this.countNew());
					this.navScrollCounterOff();
				}
			} else {
				this.navScrollCounterOff();
			}
		},
		navScrollCounterOn: function () {
			if (!this.navTxtRecalcScroll && this.showTree()) {
				//Если дерево уже показывается, подписываемся на скролл
				this.navTxtRecalcScroll = _.debounce(this.navTxtRecalc.bind(this), 300);
				$window.on('scroll', this.navTxtRecalcScroll);
			}
		},
		navScrollCounterOff: function () {
			if (this.navTxtRecalcScroll) {
				$window.off('scroll', this.navTxtRecalcScroll);
				delete this.navTxtRecalcScroll;
			}
		},

		navTxtRecalc: function () {
			var $navigator = $('.navigator', this.$dom);

			if (!$navigator.length) {
				return;
			}

			var up = $navigator.find('.up')[0],
				down = $navigator.find('.down')[0],
				waterlineOffset = $navigator.offset().top + $navigator.height() / 2 >> 0,
				upCount = 0,
				downCount = 0,

				newComments = this.$cmts[0].querySelectorAll('.isnew'),
				$element,
				offset,
				i = newComments.length;

			while (i--) {
				$element = $(newComments[i]);
				offset = $element.offset().top;

				if (offset < waterlineOffset && (offset + $element.height() < waterlineOffset)) {
					upCount++;
				} else if (offset > waterlineOffset) {
					downCount++;
				}
			}

			up.classList[upCount ? 'add' : 'remove']('active');
			up.querySelector('.navTxt').innerHTML = upCount ? upCount : '';
			up[upCount ? 'setAttribute' : 'removeAttribute']('title', 'Предыдущий непрочитанный комментарий');

			down.classList[downCount ? 'add' : 'remove']('active');
			down.querySelector('.navTxt').innerHTML = downCount ? downCount : '';
			down[downCount ? 'setAttribute' : 'removeAttribute']('title', 'Следующий непрочитанный комментарий');
		}
	});
});
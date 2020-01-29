/**
 * Модель комментариев к объекту
 */
define([
    'underscore', 'underscore.string', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping',
    'noties', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'lib/doT', 'text!tpl/comment/comments.pug',
    'text!tpl/comment/cdot.pug', 'text!tpl/comment/cdotanonym.pug', 'text!tpl/comment/cdotauth.pug',
    'text!tpl/comment/cdotdel.pug', 'text!tpl/comment/cdotadd.pug', 'css!style/comment/comments'
], function (_, _s, Browser, Utils, socket, P, ko, koMapping,
             noties, Cliche, globalVM, renderer, moment, doT, html,
             doTComments, doTCommentAnonym, doTCommentAuth,
             dotCommentDel, dotCommentAdd) {
    'use strict';

    var $window = $(window);
    var commentNestingMax = 9;

    var tplComments; // Шаблон списка комментариев (для анонимных или авторизованных пользователей)
    var tplCommentsDel; // Шаблон списка удалённых комментариев (при раскрытии ветки удаленных)
    var tplCommentAuth; // Шаблон комментария для авторизованного пользователя. Нужен для вставка результата при добавлении/редактировании комментария
    var tplCommentDel; // Шаблон свёрнутого удалённого комментария
    var tplCommentAdd; // Шаблон ответа/редактирования. Поле ввода

    var formatDateRelative = Utils.format.date.relative;
    var formatDateRelativeIn = Utils.format.date.relativeIn;

    //Берем элементы, дочерние текущему комментарию
    //Сначала используем nextUntil для последовательной выборки элементов до достижения уровня текущего,
    //затем выбранные тестируем, что они уровнем ниже с помощью regexp (/l[n-9]/g),
    //так как nextUntil может вернуть комментарии уровнем выше текущего, если они встретятся сразу без равного текущему уровню
    var getChildComments = function (comment, $c) {
        var regexString = comment.level < commentNestingMax ? ('l[' + (comment.level + 1) + '-' + commentNestingMax + ']') : ('l' + commentNestingMax);
        return $c.nextUntil('.l' + comment.level).filter(function () {
            return new RegExp(regexString, 'g').test(this.className);
        });
    };

    var getCid = function (element) {
        var cid = $(element).closest('.c').attr('id');
        if (cid) {
            return Number(cid.substr(1));
        }
    };

    return Cliche.extend({
        pug: html,
        options: {
            type: 'photo', //Тип объекта по умолчанию (фото, новость и т.д.)
            count: 0, //Начальное кол-во комментариев
            countNew: 0, //Начальное кол-во новых комментариев
            subscr: false, //Подписан ли пользователь на комментарии
            autoShowOff: false, //Выключить автоматический show после создания
            nocomments: false, //Запрещено ли писать комментарии
            canReply: false //Запрещено ли писать комментарии
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);

            this.auth = globalVM.repository['m/common/auth'];
            this.type = this.options.type;
            this.cid = null;
            this.count = ko.observable(this.options.count || 0);
            this.countNew = ko.observable(this.options.countNew || 0);
            this.countDel = ko.observable(0);
            this.subscr = ko.observable(this.options.subscr || false);
            this.nocomments = ko.observable(this.options.nocomments);
            this.canReply = ko.observable(this.options.canReply);
            this.showDelComments = ko.observable(this.auth.loggedIn() && (this.auth.iAm.settings.comment_show_deleted() || globalVM.router.params().hl));

            this.loading = ko.observable(false);
            this.showTree = ko.observable(false);
            this.exe = ko.observable(false);
            this.navigating = ko.observable(false); //Флаг, что идет навигация к новому комментарию, чтобы избежать множества нажатий
            this.touch = Browser.support.touch;

            this.canModerate = ko.observable(false);
            this.canFrag = this.type === 'photo';

            this.commentsHash = {};
            this.users = {};

            this.chkSubscrClickBind = this.chkSubscrClick.bind(this);
            this.inViewportCheckBind = this.inViewportCheck.bind(this);
            this.fraging = ko.observable(false);

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
            this.hide();
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
                // Предварительно устанавливаем возможность комментирования, если комментарии не закрыты и пользователь зарегистрирован,
                // так как скорее всего запрос комментариев вернёт такое же право, чтобы сразу показалась кнопка Добавить
                this.canReply(params.canReply && !params.nocomments);
                this.canModerate(false); // Кнопку модерирования наоборот каждый раз прячем
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
                this.activatorRecieveNotice = { cb: cb, ctx: ctx };
            }

            if (this.showTree() || options && options.instant) {
                //Если дерево уже показывается или в опциях стоит немедленный показ, то запрашиваем сразу
                this.receiveTimeout = window.setTimeout(this.receive.bind(this), 100);
            } else {
                //В противном случае запрашиваем только при попадании во вьюпорт с необходимой задержкой
                this.viewportCheckTimeout = window.setTimeout(this.inViewportCheckBind, options && options.checkTimeout || 10);
            }

            if (!this.showing) {
                //Пока данные запрашиваются в первый раз, компилим doT шаблоны для разных вариантов, если еще не скомпилили их раньше
                if (!tplComments) {
                    tplComments = doT.template(doTComments, undefined, {
                        comment: loggedIn ? doTCommentAuth : doTCommentAnonym,
                        del: dotCommentDel
                    });
                }
                if (loggedIn && !tplCommentAuth) {
                    tplCommentAuth = doT.template(doTCommentAuth, _.defaults({ varname: 'c,it' }, doT.templateSettings), { del: dotCommentDel });
                    tplCommentAdd = doT.template(dotCommentAdd);
                }
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
            var that = this;

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
                        var $c = $(this).closest('.c');
                        var cid = getCid($c);
                        if (cid) {
                            that.edit(cid, $c);
                        }
                    })
                    .on('click', '.remove', function () {
                        var $c = $(this).closest('.c');
                        var cid = getCid($c);
                        if (cid) {
                            that.remove(cid, $c);
                        }
                    })
                    .on('click', '.delico', function () {
                        var $c = $(this).closest('.c');
                        var cid = getCid($c);
                        if (cid) {
                            that.delShow(cid, $c);
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
                var cTop = this.$container.offset().top;
                var wFold = P.window.h() + (window.pageYOffset || $window.scrollTop());

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
            //Заново вешаем события на блок комментариев с учетом логина
            this.eventsOn();

            //Компилим шаблоны для зарегистрированного пользователя
            tplComments = doT.template(doTComments, undefined, { comment: doTCommentAuth, del: dotCommentDel });
            tplCommentAuth = doT.template(doTCommentAuth, _.defaults({ varname: 'c,it' }, doT.templateSettings), { del: dotCommentDel });
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
            if (this.users[this.auth.iAm.login()] === undefined) {
                var u = {
                    login: this.auth.iAm.login(),
                    avatar: this.auth.iAm.avatarth(),
                    disp: this.auth.iAm.disp(),
                    ranks: this.auth.iAm.ranks(),
                    online: true
                };
                if (u.ranks) {
                    //Если есть звания у пользователя - обрабатываем их
                    var rankObj = {};
                    rankObj[this.auth.iAm.login()] = u;
                    this.usersRanks(rankObj);
                }
                this.users[this.auth.iAm.login()] = u;
            }
        },

        // Подписывается-отписывается от комментариев
        subscribe: function (data, event, byCommentCreate) {
            socket.run('subscr.subscribeUser', { cid: this.cid, type: this.type, subscribe: !this.subscr() }, true)
                .then(function (result) {
                    var subscrFlag = !!result.subscribe;
                    var subscrGAction = subscrFlag ? (byCommentCreate ? 'createAutoReply' : 'create') : 'delete';

                    this.parentModule.setSubscr(subscrFlag);
                    this.subscr(subscrFlag);
                    ga('send', 'event', 'subscription', subscrGAction, 'subscription ' + subscrGAction);
                }.bind(this));
        },

        receive: function (cb, ctx, cbBeforeRender) {
            this.loading(true);
            socket.run('comment.giveForObj', { type: this.type, cid: this.cid, showDel: this.showDelComments() }, true).then(function (data) {
                if (data.cid !== this.cid) {
                    console.info('Comments received for another ' + this.type + ' ' + data.cid);
                } else {
                    var canModerate = !!data.canModerate;
                    var canReply = !!data.canReply;

                    this.usersRanks(data.users);
                    this.users = _.assign(data.users, this.users);

                    // Если общее кол-во изменилось пока получали, то присваиваем заново
                    if (this.count() !== data.countTotal) {
                        this.parentModule.commentCountIncrement(data.countTotal - this.count());
                        this.count(data.countTotal);
                    }
                    this.countNew(data.countNew);
                    this.countDel(data.countDel || 0);
                    this.canModerate(canModerate);
                    this.canReply(canReply);

                    if (Utils.isType('function', cbBeforeRender)) {
                        cbBeforeRender.call(ctx, data);
                    }

                    // Отрисовываем комментарии путем замены innerHTML результатом шаблона dot
                    this.$cmts[0].innerHTML = this.renderComments(data.comments, tplComments, true);

                    // Если у пользователя есть право отвечать в комментариях этого объекта,
                    // сразу добавляем ответ нулевого уровня
                    if (canReply) {
                        this.inputZeroAdd();
                    }
                    this.showTree(true);
                }

                this.loading(false);
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, data);
                }
                // Уведомляем активатор (родительский модуль) о получении данных
                if (this.activatorRecieveNotice) {
                    this.activatorRecieveNotice.cb.call(this.activatorRecieveNotice.ctx || window);
                    delete this.activatorRecieveNotice;
                }
            }.bind(this));
        },
        renderComments: function (tree, tpl, changeHash) {
            var usersHash = this.users;
            var commentsPlain = [];
            var commentsHash;

            if (changeHash) {
                commentsHash = this.commentsHash = {};
            } else {
                commentsHash = this.commentsHash;
            }

            (function treeRecursive(tree) {
                var comment;

                for (var i = 0, len = tree.length; i < len; i++) {
                    comment = tree[i];
                    comment.user = usersHash[comment.user];
                    commentsHash[comment.cid] = comment;
                    commentsPlain.push(comment);
                    if (comment.comments) {
                        treeRecursive(comment.comments, comment);
                    }
                }
            }(tree));

            return tpl({
                comments: commentsPlain,
                reply: this.canReply(),
                mod: this.canModerate(),
                fDate: formatDateRelative,
                fDateIn: formatDateRelativeIn
            });
        },
        usersRanks: function (users) {
            var user;
            var rank;
            var r;

            for (var i in users) {
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
            var $element;
            var highlight;
            var elementHeight;
            var scrollTopOffset;
            var scrollDelta;

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
                    $window.scrollTo(scrollTopOffset - P.window.head, {
                        duration: Math.max(600, scrollDelta / 10 >> 0), onAfter: function () {
                            if (highlight) {
                                this.highlight(ccid);
                            }
                        }.bind(this)
                    });
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

        // Создаёт поле ввода комментария. Ответ или редактирование
        inputCreate: function (relatedComment, $cedit) {
            var $cadd;
            var $input;
            var $insertAfter;
            var inputCid = 0;
            var level = 0;
            var txt;
            var that = this;
            var findCommentLastChild;
            var setevents = function () {
                $input.on('focus', function () {
                    that.inputActivate($(this).closest('.cadd'));
                });
                $('.cinputLabel', $cadd).on('click', function () {
                    that.inputActivate($(this).closest('.cadd'), null, true, true);
                });
            };

            if (relatedComment) {
                if ($cedit) {
                    $insertAfter = $cedit;
                    level = relatedComment.level;
                    txt = Utils.txtHtmlToPlain(relatedComment.txt);
                } else {
                    if (relatedComment.level === commentNestingMax) {
                        // Если отвечают на комментарий максимального уровня, делаем так чтобы ответ был на его родительский
                        relatedComment = this.commentsHash[relatedComment.parent];
                    }
                    findCommentLastChild = function (c) {
                        return c.comments && c.comments.length ? findCommentLastChild(c.comments[c.comments.length - 1]) : c;
                    };
                    $insertAfter = $('#c' + findCommentLastChild(relatedComment).cid, this.$cmts);
                    level = relatedComment.level + 1;
                }
                inputCid = relatedComment.cid;
            }

            $cadd = $(tplCommentAdd({
                user: $cedit ? relatedComment.user : this.users[this.auth.iAm.login()],
                cid: inputCid,
                level: level,
                type: $cedit ? 'edit' : 'reply'
            }));
            ko.applyBindings(this, $cadd[0]);

            if ($insertAfter && $insertAfter.length) {
                $cadd.insertAfter($insertAfter);
            } else {
                // В случае, если комментариев еще нет, $insertAfter будет пуст и надо аппендить
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
        // Удаление блока комментария
        inputRemove: function ($cadd) {
            this.fragDelete();
            ko.cleanNode($cadd[0]);
            $cadd.remove();
            delete this.commentEditingFragChanged;
        },
        // Очистка комментария, без удаления
        inputReset: function ($cadd) {
            this.fragDelete();
            window.clearTimeout(this.blurTimeout);
            $cadd.removeClass('hasContent hasFocus').find('.cinput').off('keyup blur').val('').height('auto');
            delete this.commentEditingFragChanged;
        },
        // Добавляет комментарий нулевого уровня. Если его еще не существует - создаёт, если он отсоединён - вставляет
        inputZeroAdd: function () {
            if (!this.cZeroCreated) {
                this.inputCreate();
                this.cZeroCreated = true;
            } else if (this.cZeroDetached) {
                this.$cmts.append(this.cZeroDetached);
                delete this.cZeroDetached;
            }
        },
        // Отсоединяет комментарий нулевого уровня от dom
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
                .off('keyup blur')
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
        // Отслеживанием ввод, чтобы подгонять input под высоту текста
        inputKeyup: function (evt) {
            var $input = $(evt.target);
            var $cadd = $input.closest('.cadd');
            var content = $input.val().trim();

            $cadd[content ? 'addClass' : 'removeClass']('hasContent');
            this.inputCheckHeight($cadd, $input, content, true);
        },
        chkSubscrClick: function (data, event) {
            // После смены значения чекбокса подписки опять фокусируемся на поле ввода комментария
            this.inputActivate($(event.target).closest('.cadd'), null, false, true);
            return true; //Нужно чтобы значение поменялось
        },
        inputBlur: function (evt) {
            var $input = $(evt.target);
            var $cadd = $input.closest('.cadd');
            var content = $.trim($input.val());

            $input.off('keyup blur');

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
        // Проверяет что поле ввода включает весь контент по высоте, если нет - подгоняет по высоте
        // Если checkViewport=true, то после подгонки проверит, влезает ли поле ввода в экран
        inputCheckHeight: function ($cadd, $input, content, checkViewport) {
            if (!content) {
                $input.height('auto');
            } else {
                var height = $input.height();
                var heightScroll = ($input[0].scrollHeight - 8) || height;

                if (heightScroll > height) {
                    $input.height(heightScroll);
                    if (checkViewport) {
                        this.inputCheckInViewport($cadd);
                    }
                }
            }
        },
        // Проверяет что поле ввода нижней границей входит в экран, если нет - скроллит до нижней границе
        inputCheckInViewport: function ($cadd, scrollDuration, cb) {
            var wFold = P.window.h() + (window.pageYOffset || $window.scrollTop());
            var caddBottom = $cadd.offset().top + $cadd.outerHeight();

            if (wFold < caddBottom) {
                // Adding 28px to make action buttons visible
                $window.scrollTo('+=' + (caddBottom - wFold - P.window.head + 28) + 'px', {
                    axis: 'y', duration: scrollDuration || 200, onAfter: function () {
                        if (_.isFunction(cb)) {
                            cb.call(this);
                        }
                    }.bind(this)
                });
            } else if (_.isFunction(cb)) {
                cb.call(this);
            }
        },

        checkInputExists: function (cid, cb, ctx) {
            var $withContent = $('.cadd.hasContent', this.$cmts);

            if ($withContent.length) {
                noties.alert({
                    message: 'У вас есть незавершенный комментарий. Отправьте или отмените его и переходите к новому',
                    type: 'warning',
                    timeout: 4000
                });
                return cb.call(ctx, true);
            } else {
                // Удаляем пустые открытые на редактирование поля ввода, кроме первого уровня
                _.forEach($('.cadd:not([data-level="0"])'), function (item) {
                    this.inputRemove($(item));
                }, this);
                cb.call(ctx);
            }
        },

        // Активирует написание комментария нулевого уровня
        replyZero: function () {
            this.inputActivate($('.cadd', this.$cmts).last(), 600, true, true);
        },
        // Комментарий на комментарий
        reply: function (cid) {
            var commentToReply = this.commentsHash[cid];

            if (commentToReply) {
                var $cadd = $('.cadd[data-cid="' + cid + '"]');
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
        edit: function (cid, $c) {
            if (!this.canReply()) {
                return;
            }

            this.checkInputExists(cid, function (err) {
                if (err) {
                    return;
                }
                var commentToEdit = this.commentsHash[cid];
                var frag;

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
        remove: function (cid, $c) {
            var that = this;
            var comment = that.commentsHash[cid];
            var parent = comment.parent && that.commentsHash[comment.parent];
            var action = 'comment.remove';

            if (!comment || !that.canModerate() && (!that.canReply() || !comment.can.del)) {
                return;
            }

            // Подсвечиваем удаляемые текстом
            getChildComments(comment, $c).add($c).addClass('hlRemove');

            // Когда пользователь удаляет свой последний комментарий, независимо от прав,
            // он должен объяснить это просто текстом. Для этого есть отдельный action
            if (_.isEmpty(comment.comments) && comment.user.login === that.auth.iAm.login()) {
                action += '.own';
            }

            this.reasonSelect(action, 'Причина удаления', function (cancel, reason) {
                if (cancel) {
                    $('.hlRemove', this.$cmts).removeClass('hlRemove');
                    return;
                }
                socket.run('comment.remove', { type: this.type, cid: cid, reason: reason }, true)
                    .then(function (result) {
                        var count = Number(result.countComments);
                        if (!count) {
                            return;
                        }
                        if (!tplCommentDel) {
                            tplCommentDel = doT.template(
                                dotCommentDel, _.defaults({ varname: 'c,it' }, doT.templateSettings)
                            );
                        }

                        comment.lastChanged = result.stamp;
                        this.count(this.count() - count);
                        this.countDel(this.countDel() + count);
                        this.parentModule.commentCountIncrement(-count);

                        if (Array.isArray(result.frags)) {
                            this.parentModule.fragReplace(result.frags);
                        }

                        comment.del = result.delInfo;
                        // Очищаем массив дочерних как в delHide
                        delete comment.comments;
                        // Удаляем дочерние, если есть (нельзя просто удалить все .hlRemove,
                        // т.к. могут быть дочерние уже удалённые, на которых hlRemove не распространяется,
                        // но убрать их из дерева тоже надо)
                        getChildComments(comment, $c).remove();

                        if (this.showDelComments()) {
                            // If user wants to see removed comments,
                            // then replace root removed comment with the collapsed one
                            var $cdel = $(tplCommentDel(comment, {
                                fDate: formatDateRelative,
                                fDateIn: formatDateRelativeIn
                            }));
                            $c.replaceWith($cdel);
                        } else {
                            // Otherwise just remove it as well as its children
                            $c.remove();
                        }

                        // Если обычный пользователь удаляет свой ответ на свой же комментарий,
                        // пока может тот редактировать, и у того не осталось неудаленных дочерних,
                        // то проставляем у родителя кнопку удалить
                        if (!this.canModerate() && parent && parent.user.login === this.auth.iAm.login() && parent.can.edit) {
                            parent.can.del = true;
                            for (var i = 0; i < parent.comments.length; i++) {
                                if (parent.comments[i].del === undefined) {
                                    parent.can.del = false;
                                    break;
                                }
                            }
                            if (parent.can.del) {
                                $('<div class="dotDelimeter">·</div><span class="cact remove">Удалить</span>')
                                    .insertAfter($('#c' + parent.cid + ' .cact.edit', this.$cmts));
                            }
                        }

                        // Если после "схлопывания" ветки корневой удалемый оказался выше вьюпорта, скроллим до него
                        if ($cdel.offset().top < (window.pageYOffset || $window.scrollTop())) {
                            $window.scrollTo($cdel, { offset: -P.window.head, duration: 600 });
                        }

                        ga('send', 'event', 'comment', 'delete', 'comment delete success', count);

                        noties.alert({
                            message: 'Удалено комментариев: ' + count + ', от ' + result.countUsers + ' пользователя(ей)',
                            type: 'information',
                            layout: 'topRight',
                            timeout: 5000
                        });
                    }.bind(this))
                    .catch(function () {
                        $('.hlRemove', this.$cmts).removeClass('hlRemove');
                        ga('send', 'event', 'comment', 'delete', 'comment delete error');
                    }.bind(this));
            }, this);
        },
        restore: function (cid, $c) {
            var that = this;
            var comment = that.commentsHash[cid];

            if (!comment || !that.canModerate()) {
                return;
            }

            $('[data-origin="' + cid + '"]', that.$cmts).add($c).addClass('hlRestore');

            noties.confirm({
                message: 'Восстановить комментарий и его потомков, которые были удалены вместе с ним<br>(подсвечены зеленым)?',
                okText: 'Да',
                okClass: 'btn-success',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('comment.restore', { type: that.type, cid: cid }, true)
                        .then(function (result) {
                            var count = Number(result.countComments);
                            if (!count) {
                                return;
                            }

                            comment.lastChanged = result.stamp;
                            that.count(that.count() + count);
                            that.countDel(that.countDel() - count);
                            that.parentModule.commentCountIncrement(count);

                            if (Array.isArray(result.frags)) {
                                that.parentModule.fragReplace(result.frags);
                            }

                            var tplIt = {
                                reply: true,
                                mod: true,
                                fDate: formatDateRelative,
                                fDateIn: formatDateRelativeIn
                            };

                            //Заменяем корневой восстанавливаемый комментарий
                            delete comment.del;
                            $c.replaceWith(tplCommentAuth(comment, tplIt));

                            if (count > 1) {
                                //Заменяем комментарии потомки, которые были удалены вместе с корневым
                                var c;
                                for (var i in that.commentsHash) {
                                    c = that.commentsHash[i];
                                    if (c !== undefined && c.del !== undefined && c.del.origin === cid) {
                                        delete c.del;
                                        $('#c' + c.cid, that.$cmts).replaceWith(tplCommentAuth(c, tplIt));
                                    }
                                }
                            }
                            confirmer.close();
                        })
                        .catch(function () {
                            confirmer.close();
                        });
                },
                cancelText: 'Нет',
                cancelClass: 'btn-warning',
                onCancel: function () {
                    $('.hlRestore', that.$cmts).removeClass('hlRestore');
                }
            });
        },
        delShow: function (cid, $c) {
            if (this.loadingDel) {
                return;
            }
            var that = this;
            var comment = that.commentsHash[cid];
            var objCid = that.cid;

            that.loadingDel = true;
            $('.delico', $c).addClass('loading').html('');

            socket.run('comment.giveDelTree', { type: that.type, cid: cid }, true)
                .then(function (data) {
                    // Если пока запрашивали удалённый, уже перешли на новый объект - ничего не делаем
                    if (objCid !== that.cid) {
                        return;
                    }

                    that.usersRanks(data.users);
                    that.users = _.assign(data.users, that.users);

                    require(['text!tpl/comment/cdotdelopen.pug'], function (doTCommentDelOpen) {
                        // Чтобы не загружать клиента, только при первом запросе удалённых
                        // реквайрим шаблон, компилим его и вешаем нужные события на блок комментариев
                        if (!tplCommentsDel) {
                            tplCommentsDel = doT.template(doTComments, undefined, { comment: doTCommentDelOpen });
                        }
                        if (!that.delopenevents) {
                            that.$cmts
                                .on('click', '.hidedel', function () {
                                    var $c = $(this).closest('.c');
                                    var cid = getCid($c);
                                    if (cid) {
                                        that.delHide(cid, $c);
                                    }
                                })
                                .on('click', '.restore', function () {
                                    var $c = $(this).closest('.c');
                                    var cid = getCid($c);
                                    if (cid) {
                                        that.restore(cid, $c);
                                    }
                                });
                            that.delopenevents = true;
                        }
                        // Присваиваем получаенный дочерние, если они есть, чтобы, например,
                        // createInput ответа на родительский удаленного вставил поле ввода после удаленной ветки
                        comment.comments = data.comments[0].comments;
                        // Указываем, чо первый комментарий - корневой для группы
                        data.comments[0].delroot = true;
                        $c.replaceWith(that.renderComments(data.comments, tplCommentsDel));

                        that.loadingDel = false;
                    });
                })
                .catch(function () {
                    $('.delico', $c).removeClass('loading').html('Показать');
                    that.loadingDel = false;
                });
        },
        delHide: function (cid, $c) {
            var comment = this.commentsHash[cid];
            if (!comment) {
                return;
            }
            if (!tplCommentDel) {
                tplCommentDel = doT.template(dotCommentDel, _.defaults({ varname: 'c,it' }, doT.templateSettings));
            }

            delete comment.comments; //Обнуляем поддерево дочерних, чтобы, например, createInput ответа на родительский удаленного не искал его дочерние
            getChildComments(comment, $c).remove(); //Удаляем дочерние элементы dom
            $c.replaceWith(tplCommentDel(comment, { fDate: formatDateRelative, fDateIn: formatDateRelativeIn }));
        },
        reasonSelect: function (action, topic, cb, ctx) {
            if (this.reasonVM) {
                return;
            }

            renderer(
                [{
                    module: 'm/common/reason',
                    options: {
                        action: action
                    },
                    modal: {
                        topic: topic,
                        maxWidthRatio: 0.75,
                        animateScale: true,
                        offIcon: {
                            text: 'Отмена', click: function () {
                                cb.call(ctx, true);
                                this.reasonDestroy();
                            }, ctx: this
                        },
                        btns: [
                            {
                                css: 'btn-warning', text: 'Выполнить', glyphicon: 'glyphicon-ok',
                                click: function () {
                                    var reason = this.reasonVM.getReason();
                                    if (reason) {
                                        cb.call(ctx, null, reason);
                                        this.reasonDestroy();
                                    }
                                }, ctx: this
                            },
                            {
                                css: 'btn-success', text: 'Отмена',
                                click: function () {
                                    cb.call(ctx, true);
                                    this.reasonDestroy();
                                }, ctx: this
                            }
                        ]
                    },
                    callback: function (vm) {
                        this.reasonVM = vm;
                        this.childModules[vm.id] = vm;
                    }.bind(this)
                }],
                {
                    parent: this,
                    level: this.level + 1
                }
            );
        },
        reasonDestroy: function () {
            if (this.reasonVM) {
                this.reasonVM.destroy();
                delete this.reasonVM;
            }
        },
        cancel: function (vm, event) {
            var $cadd = $(event.target).closest('.cadd');
            var cid = $cadd.data('cid');
            var type = $cadd.data('type');

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
            var $cadd = $(event.target).closest('.cadd');
            var $input = $('.cinput', $cadd);
            var create = $cadd.data('type') === 'reply';
            var cid = Number($cadd.data('cid'));
            var content = $input.val(); //Операции с текстом сделает сервер
            var dataInput;
            var dataToSend;

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
            var self = this;

            if (parent) {
                // Значит создается дочерний комментарий
                dataSend.parent = parent.cid;
                dataSend.level = ~~parent.level + 1;
            }

            socket.run('comment.create', dataSend, true).then(function (result) {
                if (!result.comment) {
                    return;
                }

                var comment = result.comment;
                comment.user = self.users[comment.user];
                comment.can.edit = true;
                comment.can.del = true;

                self.commentsHash[comment.cid] = comment;
                var $c = $(tplCommentAuth(comment, {
                    reply: self.canReply(),
                    mod: self.canModerate(),
                    fDate: formatDateRelative,
                    fDateIn: formatDateRelativeIn
                }));

                if (parent) {
                    if (!parent.comments) {
                        parent.comments = [];
                    }
                    parent.comments.push(comment);
                    comment.parent = parent.cid;

                    // Если это комментарий-ответ, заменяем поле ввода новым комментарием
                    $cadd.replaceWith($c);
                    self.fragDelete();
                    delete self.commentEditingFragChanged;

                    // Если обычный пользователь отвечает на свой комментарий, пока может его удалить,
                    // то отменяем у родителя возможность удалить
                    if (!self.canModerate() && parent.can.del) {
                        parent.can.del = false;
                        var $cparent = $('#c' + parent.cid, self.$cmts);
                        $('.remove', $cparent).prev('.dotDelimeter').remove();
                        $('.remove', $cparent).remove();
                    }
                } else {
                    // Если это ответ первого уровня, сбрасываем поле ввода и вставляем перед ним результат
                    $c.insertBefore($cadd);
                    self.inputReset($cadd);
                }

                self.auth.setProps({ ccount: self.auth.iAm.ccount() + 1 }); // Инкрементим комментарии пользователя
                self.count(self.count() + 1);
                self.parentModule.commentCountIncrement(1);
                if (self.canFrag && Utils.isType('object', result.frag)) {
                    self.parentModule.fragAdd(result.frag); // Если добавили фрагмент вставляем его в фотографию
                }

                cb(result);
            });
        },
        sendUpdate: function (comment, dataSend, cb, $cadd) {
            if (!this.canModerate() && (!this.canReply() || !comment.can.edit)) {
                return;
            }
            var fragExists = this.canFrag && comment.frag && ko.toJS(this.parentModule.fragGetByCid(comment.cid));

            dataSend.cid = comment.cid;

            // Если у комментария был фрагмент и он не изменился, то вставляем этот оригинальный фрагмент,
            // потому что даже если мы не двигали его в интерфейсе, он изменится из-за округления пикселей
            if (fragExists && !this.commentEditingFragChanged) {
                dataSend.fragObj = _.pick(fragExists, 'cid', 'w', 'h', 't', 'l');
            }

            var self = this;
            socket.run('comment.update', dataSend, true).then(function (result) {
                if (!result.comment) {
                    return;
                }
                comment.txt = result.comment.txt;
                comment.lastChanged = result.comment.lastChanged;

                if (self.canFrag && self.commentEditingFragChanged) {
                    if (Utils.isType('object', result.frag)) {
                        comment.frag = true;
                        if (!fragExists) {
                            self.parentModule.fragAdd(result.frag);
                        } else {
                            self.parentModule.fragRemove(comment.cid);
                            self.parentModule.fragAdd(result.frag);
                        }
                    } else if (fragExists) {
                        comment.frag = false;
                        self.parentModule.fragRemove(comment.cid);
                    }
                }

                var $c = $(tplCommentAuth(comment, {
                    reply: self.canReply(),
                    mod: self.canModerate(),
                    fDate: formatDateRelative,
                    fDateIn: formatDateRelativeIn
                }));
                $('#c' + comment.cid, self.$cmts).replaceWith($c); // Заменяем комментарий на новый
                self.inputRemove($cadd); // Удаляем поле ввода

                cb(result);
            });
        },
        fragClick: function (data, event) {
            if (!this.canFrag) {
                return;
            }

            if (!this.fraging()) {
                this.fraging(true);
                this.commentEditingFragChanged = true;
                $(event.target).closest('.cadd').addClass('hasContent');
            }
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
            if (!this.histVM) {
                renderer(
                    [
                        {
                            module: 'm/comment/hist',
                            options: { cid: cid, type: this.type },
                            modal: {
                                topic: 'История изменений комментария',
                                animateScale: true,
                                curtainClick: { click: this.closeHistory, ctx: this },
                                offIcon: { text: 'Закрыть', click: this.closeHistory, ctx: this },
                                btns: [
                                    { css: 'btn-primary', text: 'Закрыть', click: this.closeHistory, ctx: this }
                                ]
                            },
                            callback: function (vm) {
                                this.histVM = this.childModules[vm.id] = vm;
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
        closeHistory: function () {
            if (this.histVM) {
                this.histVM.destroy();
                delete this.histVM;
            }
        },

        setNoComments: function () {
            socket.run('comment.setNoComments', { cid: this.cid, type: this.type, val: !this.nocomments() }, true)
                .then(function (data) {
                    this.parentModule.setNoComments(!!data.nocomments);
                    this.nocomments(!!data.nocomments);
                }.bind(this));
        },


        toggleShowDelComments: function () {
            if (this.loading()) {
                return;
            }

            this.showDelComments(!this.showDelComments());
            this.receive(null, this, function () {
                //Перед рендером надо вынуть ответ первого уровня из dom,
                //и положить после рендеринга заново, т.к. рендеринг заменяет innerHTML блока комментариев
                this.inputZeroDetach();
                //Удаляем через jquery остальные возможные поля ввода, чтобы снять с них события
                $('.cadd', this.$cmts).remove();
            });
        },

        navUp: function () {
            this.navCheckBefore(-1);
        },
        navDown: function () {
            this.navCheckBefore(1);
        },
        // Сначала проверяет, не навигируется ли сейчас и есть ли дерево, если нет - запросит
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
            var $navigator = $('.navigator', this.$dom);
            var waterlineOffset;
            var elementsArr = [];

            var newComments = this.$cmts[0].querySelectorAll('.isnew');
            var $element;
            var offset;
            var i;

            if (!newComments || !newComments.length) {
                return;
            }

            if (onlyFirst) {
                $element = $(newComments[0]);
                elementsArr.push({ offset: $element.offset().top, $element: $element });
            } else {
                waterlineOffset = $navigator.offset().top + $navigator.height() / 2 >> 0;
                for (i = 0; i < newComments.length; i++) {
                    $element = $(newComments[i]);
                    offset = $element.offset().top;

                    if ((dir < 0 && offset < waterlineOffset && (offset + $element.height() < waterlineOffset)) || (dir > 0 && offset > waterlineOffset)) {
                        elementsArr.push({ offset: offset, $element: $element });
                    }
                }
            }

            if (elementsArr.length) {
                this.navigating(true);
                elementsArr.sort(function (a, b) {
                    return a.offset - b.offset;
                });
                $window.scrollTo(elementsArr[dir > 0 ? 0 : elementsArr.length - 1].offset - P.window.h() / 2 + P.window.head - 2 >> 0, {
                    duration: 400, onAfter: function () {
                        this.navigating(false);
                    }.bind(this)
                });
            }
        },
        showTreeHandler: function (/* val */) {
            this.navCounterHandler();
        },
        navCounterHandler: function () {
            if (this.countNew()) {
                if (this.showTree()) {
                    this.navTxtRecalc();
                    this.navScrollCounterOn();
                } else {
                    // Если дерево еще скрыто, т.е. receive еще не было, просто пишем сколько новых комментариев ниже
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

            var up = $navigator.find('.up')[0];
            var down = $navigator.find('.down')[0];
            var waterlineOffset = $navigator.offset().top + $navigator.height() / 2 >> 0;
            var upCount = 0;
            var downCount = 0;

            var newComments = this.$cmts[0].querySelectorAll('.isnew');
            var $element;
            var offset;
            var i = newComments.length;

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
            up.querySelector('.navTxt').innerHTML = upCount ? globalVM.intl.num(upCount) : '';
            up[upCount ? 'setAttribute' : 'removeAttribute']('title', 'Предыдущий непрочитанный комментарий');

            down.classList[downCount ? 'add' : 'remove']('active');
            down.querySelector('.navTxt').innerHTML = downCount ? globalVM.intl.num(downCount) : '';
            down[downCount ? 'setAttribute' : 'removeAttribute']('title', 'Следующий непрочитанный комментарий');
        }
    });
});
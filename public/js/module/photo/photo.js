/**
 * Модель страницы фотографии
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'noties', 'model/Photo', 'model/Region', 'model/storage', 'm/photo/fields', 'm/photo/status', 'text!tpl/photo/photo.jade', 'css!style/photo/photo', 'bs/ext/multiselect', 'jquery-plugins/imgareaselect'], function (_, Utils, socket, P, ko, koMapping, Cliche, globalVM, renderer, moment, noties, Photo, Region, storage, fields, statuses, jade) {
    var $window = $(window);
    var imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');
    var statusKeys = statuses.keys;
    var statusNums = statuses.nums;
    var isYes = function (evt) {
        return !!evt.target.classList.contains('yes');
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            var self = this;

            this.auth = globalVM.repository['m/common/auth'];
            this.p = Photo.vm(Photo.def.full);
            this.binded = false;

            this.statuses = statuses;

            this.photoSrc = ko.observable('');
            this.photoLoading = ko.observable(true);
            this.photoLoadContainer = null;

            this.userRibbon = ko.observableArray();
            this.ribbonUserLeft = [];
            this.ribbonUserRight = [];
            this.nearestRibbon = ko.observableArray();
            this.nearestRibbonOrigin = [];

            this.rnks = ko.observable(''); // Звания пользователя в виде готового шаблона
            this.fields = fields;

            this.exe = ko.observable(false); // Указывает, что сейчас идет обработка запроса на действие к серверу
            this.exeregion = ko.observable(false); // Указывает, что сейчас идет запрос региона по координате

            this.can = koMapping.fromJS(Photo.canDef);

            this.IOwner = this.co.IOwner = ko.computed(function () {
                return this.auth.iAm.login() === this.p.user.login();
            }, this);

            this.fDateIn = Utils.format.date.relativeIn;

            this.edit = ko.observable(undefined);

            this.msg = ko.observable('');
            this.msgCss = ko.observable('');
            this.msgTitle = ko.observable('');
            this.msgLink = ko.observable('');

            this.msgByStatus = this.co.msgByStatus = ko.computed(function () {
                var status = statusNums[this.p.s()];
                var link;

                if (this.p.stdate()) {
                    link = '?history=' + this.p.stdate().getTime();
                }

                if (this.edit()) {
                    this.setMessage('Фото в режиме редактирования', 'Внесите необходимую информацию и сохраните изменения', 'warning');
                    //globalVM.pb.publish('/top/message', ['Photo is in edit mode. Please fill in the underlying fields and save the changes', 'warn']);
                } else if (status && status.title) {
                    this.setMessage(this.IOwner() ? status.title_owner : status.title, '', status.label, link);
                } else {
                    this.setMessage();
                }
            }, this);

            this.watersignIndividual = this.co.watersignIndividual = ko.computed({
                read: function () {
                    return String(self.p.watersignIndividual());
                },
                write: function (valNew) {
                    self.p.watersignIndividual(valNew === 'true');
                }
            });

            this.watersignOptionTrigger = ko.observable(null);
            this.watersignOption = this.co.watersignOption = ko.computed({
                read: function () {
                    this.watersignOptionTrigger();

                    var result;
                    var p = self.p;
                    var addSignBySetting = p.user.settings.photo_watermark_add_sign;

                    addSignBySetting = addSignBySetting && addSignBySetting() || false;

                    if (p.watersignIndividual()) {
                        var photoOption = this.p.watersignOption();
                        result = photoOption !== undefined ? photoOption : addSignBySetting;
                    } else {
                        result = addSignBySetting;
                    }

                    if (result === true) {
                        result = 'true';
                    }

                    return result;
                },
                write: function (valNew) {
                    if (valNew === 'true') {
                        valNew = true;
                    }

                    this.p.watersignOption(valNew);
                },
                owner: this
            });

            this.watersignCustom = this.co.watersignCustom = ko.computed({
                read: function () {
                    return this.p.watersignIndividual() ? this.p.watersignCustom() || '' : this.p.user.watersignCustom();
                },
                write: function (valNew) {
                    if (this.p.watersignIndividual()) {
                        this.p.watersignCustom(valNew);
                    }
                },
                owner: this
            });

            this.disallowDownloadOriginIndividual = this.co.disallowDownloadOriginIndividual = ko.computed({
                read: function () {
                    return String(self.p.disallowDownloadOriginIndividual());
                },
                write: function (valNew) {
                    self.p.disallowDownloadOriginIndividual(valNew === 'true');
                }
            });
            this.disallowDownloadOrigin = this.co.disallowDownloadOrigin = ko.computed({
                read: function () {
                    this.watersignOptionTrigger();

                    var result;
                    var p = self.p;

                    if (this.watersignOption() === false) {
                        result = false;
                    } else if (p.disallowDownloadOriginIndividual()) {
                        result = p.disallowDownloadOrigin();
                    } else {
                        var addSignBySetting = p.user.settings.photo_watermark_add_sign;
                        var disallowDownloadBySetting = p.user.settings.photo_disallow_download_origin;

                        if (addSignBySetting && addSignBySetting() === false) {
                            result = false;
                        } else {
                            result = disallowDownloadBySetting && disallowDownloadBySetting();
                        }
                    }

                    if (result === undefined) {
                        result = true;
                    }

                    if (result === true) {
                        result = 'true';
                    }

                    return result;
                },
                write: function (valNew) {
                    if (valNew === 'true') {
                        valNew = true;
                    }

                    this.p.disallowDownloadOrigin(valNew);
                },
                owner: this
            });

            var userInfoTpl = _.template('Добавил${ addEnd } <a href="/u/${ login }" ${ css }>${ name }</a>, ${ stamp }');
            this.userInfo = this.co.userInfo = ko.computed(function () {
                return userInfoTpl(
                    {
                        login: this.p.user.login(),
                        name: this.p.user.disp(),
                        css: this.p.user.online() ? 'class="online"' : '',
                        addEnd: this.p.user.sex && this.p.user.sex() === 'f' ? 'а' : '',
                        stamp: moment(this.p.ldate()).format('D MMMM YYYY')
                    }
                );
            }, this);

            this.downLoadOrigin = this.co.downLoadOrigin = ko.computed(function () {
                var download = this.can.download();

                return download === true || download === 'byrole';
            }, this);

            this.downloadCSSClass = this.co.downloadCSSClass = ko.computed(function () {
                var download = this.can.download();
                var result;

                if (download === true) {
                    result = 'btn-success';
                } else {
                    result = 'btn-primary';

                    if (download === 'byrole') {
                        result += ' downloadByRole';
                    }
                }

                return result;
            }, this);

            this.ws = ko.observable(Photo.def.full.ws);
            this.hs = ko.observable(Photo.def.full.hs);
            this.waterhs = ko.observable(Photo.def.full.waterhs);
            this.hsfull = ko.observable(this.hs() + this.waterhs());
            this.hscalePossible = ko.observable(false);
            this.hscaleTumbler = ko.observable(true);
            this.watermarkShow = ko.observable(this.auth.iAm.settings.photo_show_watermark());
            this.mapH = ko.observable('500px');
            this.thumbW = ko.observable('0px');
            this.thumbH = ko.observable('0px');
            this.thumbM = ko.observable('1px');
            this.thumbN = ko.observable(4);
            this.thumbNUser = ko.observable(3);

            this.scrollTimeout = null;
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
                    options: { type: 'photo', autoShowOff: true },
                    ctx: this,
                    callback: function (vm) {
                        this.commentsVM = this.childModules[vm.id] = vm;
                        this.routeHandler();
                    }
                }
            ];

            this.descCheckInViewportDebounced = _.debounce(this.descCheckInViewport, 210, {
                leading: false,
                trailing: true
            });

            // Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
            this.routeHandlerDebounced = _.debounce(this.routeHandler, 700, { leading: true, trailing: true });

            // Subscriptions
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
            this.subscriptions.edit = this.edit.subscribe(this.editHandler, this);
            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
            }
            this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
            this.subscriptions.hscaleTumbler = this.hscaleTumbler.subscribe(this.sizesCalcPhoto, this);
            this.subscriptions.watermarkShow = this.watermarkShow.subscribe(this.sizesCalcPhoto, this);
            this.subscriptions.photo_show_watermark = this.auth.iAm.settings.photo_show_watermark.subscribe(function (val) {
                if (val !== this.watermarkShow()) {
                    this.watermarkShow(val);
                }
            }, this);
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
            this.$dom.find('.imgMiddleWrap').off();
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
                            options: {
                                embedded: true,
                                editing: this.edit(),
                                point: this.genMapPoint(),
                                dfdWhenReady: mapReadyDeffered
                            },
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

        rechargeData: function (photo, can) {
            var originData = this.originData;

            // If data has already been, so clear it (object must remain)
            if (_.isObject(originData)) {
                Object.keys(originData).forEach(function (key) {
                    delete originData[key];
                });
                _.assign(originData, photo);
            } else {
                this.originData = photo;
            }

            this.p = Photo.vm(photo, this.p);
            this.can = koMapping.fromJS(_.defaults({}, can, Photo.canDef), this.can);

            this.watersignOptionTrigger(_.random(9e9));
        },

        routeHandler: function () {
            var self = this;
            var params = globalVM.router.params();
            var cid = Number(params.cid);
            var hl = params.hl;
            self.share = Number(params.share) === 1 ? Number(params.share) : false;
            self.history = Number(params.history) >= 0 ? Number(params.history) : false;

            self.toComment = self.toFrag = undefined;
            window.clearTimeout(self.scrollTimeout);

            if (hl) {
                if (hl.indexOf('comment-') === 0) {
                    self.toComment = hl.substr(8) || undefined; // Навигация к конкретному комментарию
                } else if (hl.indexOf('comments') === 0) {
                    self.toComment = true; // Навигация к секции комментариев
                } else if (hl.indexOf('frag-') === 0) {
                    self.toFrag = parseInt(hl.substr(5), 10) || undefined; // Навигация к фрагменту
                }
            }

            if (self.p && _.isFunction(self.p.cid) && self.p.cid() !== cid) {
                self.photoLoading(true);
                self.commentsVM.deactivate();

                this.receivePhoto(cid, false, function (data) {
                    var editModeCurr = self.edit();
                    var editModeNew = !!data.forEdit;

                    self.rechargeData(data.photo, data.can);

                    Utils.title.setTitle({ title: self.p.title() });

                    if (self.photoLoadContainer) {
                        self.photoLoadContainer.off('load').off('error');
                    }
                    self.photoLoadContainer = $(new Image())
                        .on('load', self.onPhotoLoad.bind(self))
                        .on('error', self.onPhotoError.bind(self))
                        .attr('src', self.p.sfile());

                    self.processRanks(self.p.user.ranks());
                    self.getUserRibbon(3, 4, self.applyUserRibbon, self);
                    self.getNearestRibbon(12, self.applyNearestRibbon, self);

                    // В первый раз точку передаем сразу в модуль карты, в следующие устанавливам методами
                    if (self.binded) {
                        $.when(self.mapModulePromise).done(self.setMapPoint.bind(self));
                    }

                    if (editModeCurr !== editModeNew) {
                        self.edit(editModeNew);
                    } else {
                        self.editHandler(editModeCurr);
                    }

                    if (!self.binded) {
                        self.makeBinding();
                    }

                    if (self.share !== false && !self.edit()) {
                        self.showShare();
                    } else {
                        self.destroyShare();
                    }

                    if (self.history !== false && !self.edit()) {
                        self.showHistory();
                    } else {
                        self.destroyHistory();
                    }
                    ga('send', 'pageview', '/p');
                }, this);
            } else {
                if (self.toFrag || self.toComment) {
                    self.scrollTimeout = setTimeout(self.scrollToBind, 50);
                }
                if (self.share !== false) {
                    self.showShare();
                } else {
                    self.destroyShare();
                }
                if (self.history !== false) {
                    self.showHistory();
                } else {
                    self.destroyHistory();
                }
            }
        },

        receivePhoto: function (cid, edit, cb, ctx) {
            var finish = function (data) {
                Photo.factory(data.photo, 'full', 'd', 'middle', 'middle');

                cb.call(ctx, data);
            };

            if (_.get(init, 'photo.photo.cid') === cid) {
                finish(init.photo);
                delete init.photo;
                return;
            }

            socket.run('photo.giveForPage', { cid: cid, forEdit: edit }, true).then(finish);
        },

        loggedInHandler: function () {
            // После логина перезапрашиваем ленту фотографий пользователя
            this.getUserRibbon(3, 4, this.applyUserRibbon, this);
            // Запрашиваем разрешенные действия для фото
            storage.photoCan(this.p.cid(), function (data) {
                if (!data.error) {
                    this.can = koMapping.fromJS(_.defaults({}, data.can, Photo.canDef), this.can);
                    this.sizesCalc();
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
            //В режиме редактирования подписываемся на изменение координаты, чтобы обновить регион
            this.subscriptions.geoChange = this.p.geo.subscribe(this.editGeoChange, this);
        },
        mapEditOff: function () {
            this.mapVM.editPointOff();
            if (this.subscriptions.geoChange && this.subscriptions.geoChange.dispose) {
                this.subscriptions.geoChange.dispose();
            }
        },

        // Установить фото для точки на карте
        setMapPoint: function () {
            this.mapVM.setPoint(this.genMapPoint());
        },
        genMapPoint: function () {
            return _.pick(this.p, 'geo', 'year', 'dir', 'title', 'regions');
        },
        editGeoChange: function (geo) {
            if (geo) {
                this.getRegionsByGeo(geo);
            }
        },

        //Вызывается после рендеринга шаблона информации фото
        tplAfterRender: function (elements, vm) {
            if (vm.edit()) {
                vm.descSetEdit();
            }
        },

        //Пересчитывает все размеры, зависимые от размера окна
        sizesCalc: function () {
            var rightPanelW = this.$dom.find('.rightPanel').width();
            var userRibbonW = rightPanelW - 85;

            var thumbW;
            var thumbH;

            var thumbWV1 = 84; //Минимальная ширина thumb
            var thumbWV2 = 90; //Максимальная ширина thumb
            var thumbMarginMin = 1;
            var thumbMarginMax = 7;
            var thumbMargin;
            var thumbNMin = 2;
            var thumbNV1;
            var thumbNV2;
            var thumbNV1User;

            thumbNV1 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV1 + thumbMarginMin) >> 0);
            thumbNV2 = Math.max(thumbNMin, (rightPanelW + thumbMarginMin) / (thumbWV2 + thumbMarginMin) >> 0);
            thumbNV1User = Math.max(thumbNMin, (userRibbonW + thumbMarginMin) / (thumbWV1 + thumbMarginMin) >> 0);

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
        },
        // Пересчитывает размер фотографии
        sizesCalcPhoto: function () {
            var maxWidth = this.$dom.find('.photoPanel').width() - 24 >> 0;
            var maxHeight = P.window.h() - this.$dom.find('.imgRow').offset().top - 58 >> 0;
            var ws = this.p.ws();
            var hs = this.p.hs(); // Image heigth without watermark
            var water = this.p.waterhs(); // Watermark heigth
            var hsfull = hs + water; // Image height with watermark
            var waterRatio = water / hsfull;
            var aspect = ws / hsfull;
            var fragSelection;

            // Подгоняем по максимальной ширине
            if (ws > maxWidth) {
                ws = maxWidth;
                hsfull = Math.round(ws / aspect);
                water = Math.ceil(waterRatio * hsfull);
                hs = hsfull - water;
            }

            // Если устанавливаемая высота больше максимальной высоты,
            // то делаем возможным hscale и при влюченном тумблере hscale пересчитываем высоту и ширину
            if (hs > maxHeight) {
                this.hscalePossible(true);
                if (this.hscaleTumbler()) {
                    hs = maxHeight;
                    if (water) {
                        water = Math.ceil(waterRatio * hs / (1 - waterRatio));
                    }
                    hsfull = hs + water;
                    ws = Math.round(hsfull * aspect);
                }
            } else {
                this.hscalePossible(false);
            }

            this.ws(ws);
            this.hs(hs);
            this.hsfull(hsfull);
            this.waterhs(water);

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
            this.descEditOrigin = Utils.txtHtmlToPlain(this.p.desc());
            this.p.desc(this.descEditOrigin);
            this.descCheckHeight(this.$dom.find('.descInput'));

            this.sourceEditOrigin = Utils.txtHtmlToPlain(this.p.source());
            this.p.source(this.sourceEditOrigin);

            this.authorEditOrigin = Utils.txtHtmlToPlain(this.p.author());
            this.p.author(this.authorEditOrigin);
        },
        inputlblfocus: function (data, event) {
            var label = event.target && event.target.previousElementSibling;
            if (label && label.classList) {
                label.classList.add('on');
            }
        },
        inputlblblur: function (data, event) {
            var label = event.target && event.target.previousElementSibling;
            if (label && label.classList) {
                label.classList.remove('on');
            }
        },
        descFocus: function (data, event) {
            this.inputlblfocus(data, event);
            $(event.target)
                .addClass('hasFocus')
                .off('keyup') //На всякий случай убираем обработчики keyup, если blur не сработал
                .on('keyup', _.debounce(this.descKeyup.bind(this), 300));
            this.descCheckInViewportDebounced($(event.target));
        },
        descBlur: function (data, event) {
            this.inputlblblur(data, event);
            $(event.target).removeClass('hasFocus').off('keyup');
        },
        // Отслеживанием ввод, чтобы подгонять desc под высоту текста
        descKeyup: function (evt) {
            var $input = $(evt.target);
            var realHeight = this.descCheckHeight($input);

            // Если высота изменилась, проверяем вхождение во вьюпорт с этой высотой
            // (т.к. у нас transition на высоту textarea, сразу правильно её подсчитать нельзя)
            if (realHeight) {
                this.descCheckInViewport($input, realHeight);
            }
        },
        // Подгоняем desc под высоту текста.
        // Если высота изменилась, возвращаем её, если нет - false
        descCheckHeight: function ($input) {
            var height = $input.height() + 2; //2 - border
            var heightScroll = ($input[0].scrollHeight) || height;
            var content = $.trim($input.val());

            if (!content) {
                $input.height('auto');
                return false;
            } else if (heightScroll > height) {
                $input.height(heightScroll);
                return heightScroll;
            }
        },
        descCheckInViewport: function (input, inputHeight) {
            var cBottom = input.offset().top + (inputHeight || (input.height() + 2)) + 10;
            var wTop = $window.scrollTop();
            var wFold = $window.height() + wTop;

            if (wFold < cBottom) {
                $window.scrollTo('+=' + (cBottom - wFold - P.window.head) + 'px', { axis: 'y', duration: 200 });
            }
        },
        yearCheck: function () {
            var p = this.p;
            var year = Number(p.year());
            var year2 = Number(p.year2());

            if (!year) {
                // Если значение нулевое или не парсится, ставим дефолтное
                year = Photo.def.full.year;
            } else {
                // Убеждаемся, что оно в допустимом интервале
                year = Math.min(Math.max(year, 1826), 2000);
            }

            p.year(year);

            // Если год начала пустой, то и конца обнуляем
            // Если не пустой, а год конца не заполнен или меньше начала, ставим год конца равным началу
            if (!year || year && (!year2 || year > year2)) {
                p.year2(year);
            }
        },
        year2Check: function () {
            var p = this.p;
            var year = Number(p.year());
            var year2 = Number(p.year2());

            if (!year2) {
                // Если значение нулевое или не парсится, ставим год начала или дефолтное
                year2 = year || Photo.def.full.year2;
            } else {
                // Убеждаемся, что оно в допустимом интервале и не мене year
                year2 = Math.min(Math.max(year2, year || 1826), 2000);
            }

            p.year2(year2);

            // Если год конца заполнен, а начала - нет, заполняем
            if (year2 && !year) {
                p.year(year2);
            }
        },

        getRegionsByGeo: function (geo) {
            this.exeregion(true);

            socket.run('region.giveRegionsByGeo', { geo: geo }, true)
                .then(function (data) {
                    // Если вернулись данные для другой(прошлой) точки или мы уже не в режиме редактирования, то выходим
                    if (this.edit() && data && !_.isEqual(data.geo, this.p.geo())) {
                        return;
                    }

                    Photo.vm({ regions: data.regions }, this.p, true); // Обновляем регионы

                    this.exeregion(false);
                }.bind(this));
        },
        regionSelect: function () {
            if (!this.regselectVM) {
                var selected = _.last(koMapping.toJS(this.p.regions()));
                if (selected) {
                    selected = [selected];
                } else {
                    selected = undefined;
                }

                renderer(
                    [
                        {
                            module: 'm/region/select',
                            options: {
                                min: 0,
                                max: 1,
                                selectedInit: selected
                            },
                            modal: {
                                topic: 'Выбор региона принадлежности для фотографии',
                                initWidth: '900px',
                                maxWidthRatio: 0.95,
                                fullHeight: true,
                                withScroll: true,
                                offIcon: { text: 'Отмена', click: this.closeRegionSelect, ctx: this },
                                btns: [
                                    {
                                        css: 'btn-success',
                                        text: 'Применить',
                                        glyphicon: 'glyphicon-ok',
                                        click: function () {
                                            var regions = this.regselectVM.getSelectedRegionsFull(['cid', 'title_local']);

                                            if (regions.length > 1) {
                                                noties.alert({
                                                    message: 'Допускается выбрать только один регион',
                                                    type: 'error',
                                                    timeout: 2500
                                                });
                                                return;
                                            }
                                            Photo.vm({ regions: regions[0] || [] }, this.p, true); //Обновляем регионы
                                            this.closeRegionSelect();
                                        },
                                        ctx: this
                                    },
                                    { css: 'btn-warning', text: 'Отмена', click: this.closeRegionSelect, ctx: this }
                                ]
                            },
                            callback: function (vm) {
                                this.regselectVM = vm;
                                this.childModules[vm.id] = vm;
                            }.bind(this)
                        }
                    ],
                    {
                        parent: this,
                        level: this.level + 3 //Чтобы не удалился модуль карты
                    }
                );
            }
        },
        closeRegionSelect: function () {
            if (this.regselectVM) {
                this.regselectVM.destroy();
                delete this.regselectVM;
            }
        },

        watersignOptionChange: function (data, evt) {
            var flag = isYes(evt);
            var p = this.p;
            var user = p.user;
            var newOption;

            if (!flag) {
                newOption = false;
            } else {
                if (!p.watersignCustom() && user.settings.photo_watermark_add_sign() === 'custom' && user.watersignCustom()) {
                    p.watersignCustom(user.watersignCustom());
                }

                newOption = p.watersignCustom() ? 'custom' : true;
            }

            p.watersignOption(newOption);
        },
        downloadOriginChange: function (data, evt) {
            this.p.disallowDownloadOrigin(!isYes(evt));
        },
        nowaterchangeChange: function (data, evt) {
            this.p.nowaterchange(!isYes(evt));
        },

        notifyReady: function () {
            noties.alert({
                message: 'Чтобы фотография была опубликована, необходимо оповестить об этом модераторов<br>' +
                'Вы можете сделать это в любое время, нажав кнопку «На публикацию»',
                type: 'information',
                layout: 'topRight',
                timeout: 6000
            });
        },
        notifyReconvert: function () {
            noties.alert({
                message: 'Вы изменили настройки подписи на вотермарке фотографии.<br>' +
                'Изображение изменится в течении нескольких минут, обновите страницу позже',
                type: 'information',
                layout: 'topRight',
                timeout: 5000
            });
        },
        askForGeo: function (cb, ctx) {
            noties.alert({
                message: 'Вы не указали точку съемки фотографии на карте и регион, к которому она может принадлежать.<br><br>' +
                'Установить точку можно в режиме редактирования, кликнув по карте справа и перемещая появившийся маркер.<br><br>' +
                'Без точки на карте фотография попадет в раздел «Где это?». ' +
                'В этом случае, чтобы сообщество в дальнейшем помогло определить координаты, необходимо указать регион, ' +
                'в котором предположительно сделана данная фотография<br><br>',
                type: 'confirm',
                animation: { open: 'animated fadeIn' },
                buttons: [
                    {
                        addClass: 'btn btn-success margBott',
                        text: 'Указать координаты',
                        onClick: function ($noty) {
                            this.edit(true);
                            $noty.close();
                        }.bind(this)
                    },
                    {
                        addClass: 'btn btn-warning margBott',
                        text: 'Выбрать регион вручную',
                        onClick: function ($noty) {
                            this.edit(true);
                            $noty.close();
                            this.regionSelect();
                        }.bind(this)
                    },
                    {
                        addClass: 'btn btn-danger margBott', text: 'Отмена',
                        onClick: function ($noty) {
                            if (cb) {
                                cb.call(ctx);
                            }
                            $noty.close();
                        }
                    }
                ]
            });
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
                    level: this.level + 3
                }
            );

        },
        reasonDestroy: function () {
            if (this.reasonVM) {
                this.reasonVM.destroy();
                delete this.reasonVM;
            }
        },

        showHistory: function () {
            var self = this;
            var cid = self.p.cid();

            if (!self.histVM) {
                renderer(
                    [{
                        module: 'm/photo/hist',
                        options: {
                            cid: cid,
                            scroll: this.history || 0,
                            newSince: self.p.vdate()
                        },
                        modal: {
                            topic: 'История изменений фотографии',
                            initWidth: '1400px',
                            maxWidthRatio: 0.82,
                            animateScale: true,
                            curtainClick: { click: self.closeHistoryOrShare, ctx: self },
                            offIcon: { text: 'Закрыть', click: self.closeHistoryOrShare, ctx: self },
                            btns: [
                                { css: 'btn-primary', text: 'Закрыть', click: self.closeHistoryOrShare, ctx: self }
                            ]
                        },
                        callback: function (vm) {
                            self.histVM = self.childModules[vm.id] = vm;
                            ga('send', 'event', 'photo', 'history');
                        }
                    }],
                    {
                        parent: self,
                        level: self.level + 3
                    }
                );
            } else if (this.history !== false) {
                self.histVM.setNewScroll(this.history);
            }
        },
        destroyHistory: function () {
            if (this.histVM) {
                this.histVM.destroy();
                delete this.histVM;
            }
        },
        closeHistoryOrShare: function () {
            // При закрытии надо сделать replaceState, чтобы текущей страницей истории стала страница самой фотографии,
            // чтобы при переходе назад, перейти не на историю, а на исходный referrer
            globalVM.router.navigate('/p/' + this.p.cid(), { replace: true });
        },

        showShare: function () {
            var self = this;
            var p = self.p;
            var title = p.title() || 'Photo at PatVu.com';
            var desc = p.desc() || '';
            var link = '/p/' + p.cid();

            if (!self.shareVM) {
                // Include years in OpenGraph title, if they are not in title already
                if (!title.includes(p.year()) && (!p.year2() || !title.includes(p.year2()))) {
                    title = p.y() + ' ' + title;
                }
                if (desc) {
                    desc = Utils.txtHtmlToPlain(desc, true);
                } else if (!_.isEmpty(p.regions())) {
                    // If there in no description, create it as regions names
                    desc = p.regions().reduceRight(function (result, region, index) {
                        result += region.title_local() + (index ? ', ' : '');
                        return result;
                    }, '');
                }

                renderer(
                    [{
                        module: 'm/common/share',
                        options: {
                            title: title,
                            desc: desc,
                            img: '/_p/a/' + p.file(),
                            linkPage: link,
                            linkSocial: link,
                            linkObject: '/_p/a/' + p.file()
                        },
                        modal: {
                            topic: 'Поделиться фотографией',
                            initWidth: '500px',
                            animateScale: true,
                            curtainClick: { click: self.closeHistoryOrShare, ctx: self },
                            offIcon: { text: 'Закрыть', click: self.closeHistoryOrShare, ctx: self },
                            btns: [
                                { css: 'btn-primary', text: 'Закрыть', click: self.closeHistoryOrShare, ctx: self }
                            ]
                        },
                        callback: function (vm) {
                            self.shareVM = self.childModules[vm.id] = vm;
                        }
                    }],
                    {
                        parent: self,
                        level: self.level + 3
                    }
                );
            }
        },
        destroyShare: function () {
            if (this.shareVM) {
                this.shareVM.destroy();
                delete this.shareVM;
            }
        },

        download: (function () {
            var supportDownloadAttribute = 'download' in document.createElement('a');
            var waitingForKey = false;
            var downloadPath = '//' + P.settings.server.hostname() + P.settings.server.dport() + '/download/';
            var getDownloadKey = function (cid) {
                waitingForKey = true;
                socket.run('photo.getDownloadKey', { cid: cid })
                    .then(function (data) {
                        ga(
                            'send', 'event', 'download',
                            data.origin ? 'origin' : 'water', 'download ' + (data.origin ? 'origin' : 'water')
                        );

                        var a = document.createElement('a');
                        a.setAttribute('href', downloadPath + data.key);
                        // Tell browser that we expect to download it, to suppress warning about resource interpretation
                        // File name will be obtained from Content-Disposition anyway
                        a.setAttribute('download', '');

                        // For Firefox clicked ahref must be on page, even invisible
                        a.style.display = 'none';
                        document.body.appendChild(a);

                        Utils.clickElement(a);

                        document.body.removeChild(a);

                        waitingForKey = false;
                    })
                    .catch(function (error) {
                        ga('send', 'event', 'download', 'error', 'download error');
                        console.warn(error);
                    });
            };

            return function (data, event) {
                if (waitingForKey) {
                    event.stopPropagation();
                    event.preventDefault();
                    return false;
                }

                var a = event.currentTarget;
                var $a = $(a);

                ga('send', 'event', 'download', 'click', 'download click');

                var canDownload = this.can.download();
                var cid = data.p.cid();

                if (this.downLoadOrigin()) {
                    getDownloadKey(cid, $a);
                } else if (canDownload === 'withwater') {
                    // If browser support 'download' attribute - do nothing and it'll download with watermark by itself
                    // (to reduce server load)
                    // If don't support, get photo from server
                    if (supportDownloadAttribute) {
                        ga('send', 'event', 'download', 'water', 'download water');
                        return true;
                    }
                    getDownloadKey(cid, $a);
                } else if (canDownload === 'login' && !this.auth.loggedIn()) {
                    this.auth.show('login', function (result) {
                        if (result.loggedIn) {
                            setTimeout(function () {
                                Utils.clickElement(a);
                            }, 500);
                        }
                    }, this);
                }

                event.stopPropagation();
                event.preventDefault();
                return false;
            };
        }()),

        tryOperation: function (options) {
            var self = this;
            var callback = options.callback;
            var confirmer = options.confirmer;
            var proceedText = options.proceedText;
            var ignoreChange = options.ignoreChange;
            var requestCreater = options.requestCreater;
            var customChangedMessage = options.customChangedMessage;

            self.exe(true);
            return requestCreater(ignoreChange)
                .catch(function (error) {
                    if (error.code === 'PHOTO_CHANGED' || error.code === 'PHOTO_ANOTHER_STATUS') {
                        if (confirmer) {
                            confirmer.close();
                            confirmer = null;
                        }

                        var message = error.message + (customChangedMessage ||
                            '<br><a target="_blank" href="/p/' + self.p.cid() + '">Посмотреть последнюю версию</a>');
                        var okText = proceedText || 'Продолжить операцию';
                        var cancelText = 'Отменить операцию';

                        if (error.code === 'PHOTO_ANOTHER_STATUS') {
                            noties.alert({
                                message: error.message,
                                onOk: function () {
                                    self.exe(false);
                                }
                            });
                        } else {
                            noties.confirm({
                                message: message,
                                okText: okText,
                                cancelText: cancelText,
                                onOk: function (notiesConfirmer) {
                                    confirmer = notiesConfirmer;
                                    self.tryOperation(_.assign({}, options, {
                                        confirmer: confirmer, ignoreChange: true
                                    }));
                                },
                                onCancel: function () {
                                    self.exe(false);
                                }
                            });
                        }

                        throw error;
                    }

                    if (confirmer) {
                        confirmer.error(error, 'Закрыть', 4000, function () {
                            self.exe(false);
                        });
                    } else {
                        noties.error(error);
                    }

                    return error;
                })
                .then(function (error) {
                    if (confirmer) {
                        confirmer.close();
                    }

                    if (callback) {
                        callback({ done: true, error: error });
                    }
                })
                .catch(_.noop);
        },

        editSave: function () {
            var self = this;

            if (!self.can.edit()) {
                return;
            }

            self.edit() ? self.savePhoto() : self.editPhoto();
        },
        editCancel: function () {
            var self = this;

            if (self.edit()) {
                this.p = Photo.vm(self.originData, this.p);
                delete self.descEditOrigin;
                delete self.sourceEditOrigin;
                delete self.authorEditOrigin;

                self.edit(false);
            }
        },
        editPhoto: function () {
            var self = this;

            this.receivePhoto(self.p.cid(), true, function (data) {
                if (data.forEdit) {
                    // Если включаем редактирование, обнуляем количество новых комментариев,
                    // так как после возврата комментарии будут запрошены заново и соответственно иметь статус прочитанных
                    data.photo.ccount_new = 0;

                    self.rechargeData(data.photo, data.can);
                    self.edit(true);
                }
            }, this);

        },

        savePhoto: function () {
            var self = this;
            var p = self.p;
            var origin = self.originData;
            var cid = p.cid();

            var changes = _.chain(koMapping.toJS(p))
                .pick(
                    'geo', 'dir', 'title', 'year', 'year2', 'address',
                    'nowaterchange', 'watersignIndividual', 'disallowDownloadOriginIndividual'
                )
                .transform(function (result, value, key) {
                    var valueOrigin = origin[key];

                    if (!_.isEqual(value, valueOrigin)) {
                        if (!_.isNumber(value) && !_.isBoolean(value) && _.isEmpty(value)) {
                            result[key] = null;
                        } else {
                            result[key] = value;
                        }
                    }
                }, {})
                .value();

            if (changes.year || changes.year2) {
                changes.year = p.year() || null;
                changes.year2 = p.year2() || null;
            }

            if (_.isEmpty(p.geo())) {
                if (p.regions().length) {
                    changes.region = _.last(koMapping.toJS(p.regions)).cid;
                } else {
                    changes.region = null;
                }
            }

            if (p.desc() !== self.descEditOrigin) {
                changes.desc = p.desc() || null;
            }
            if (p.source() !== self.sourceEditOrigin) {
                changes.source = p.source() || null;
            }
            if (p.author() !== self.authorEditOrigin) {
                changes.author = p.author() || null;
            }

            var watersignOption = self.watersignOption();
            if (p.watersignIndividual()) {
                if (watersignOption === 'true') {
                    watersignOption = true;
                }
                if (watersignOption !== origin.watersignOption) {
                    changes.watersignOption = watersignOption;
                }
                if (self.watersignCustom() !== origin.watersignCustom) {
                    changes.watersignCustom = self.watersignCustom() || null;
                }
            }
            if (p.disallowDownloadOriginIndividual()) {
                var disallowDownloadOrigin = self.disallowDownloadOrigin();

                if (disallowDownloadOrigin === 'true') {
                    disallowDownloadOrigin = true;
                }
                if (watersignOption !== false && disallowDownloadOrigin !== origin.disallowDownloadOrigin) {
                    changes.disallowDownloadOrigin = disallowDownloadOrigin;
                }
            }

            if (_.isEmpty(changes)) {
                return self.edit(false);
            }

            var params = { cid: cid, cdate: p.cdate(), s: p.s(), changes: changes };
            var changedMessage = '<br>В случае продолжения сохранения, ваши изменения заменят более ранние' +
                '<br><a data-replace="true" href="?history=1">Посмотреть историю изменений</a>' +
                '<br><a target="_blank" href="/p/' + cid + '">Открыть последнюю версию</a>';

            self.tryOperation({
                proceedText: 'Продолжить сохранение', customChangedMessage: changedMessage,
                requestCreater: function (ignoreChange) {
                    return socket.run('photo.save', _.assign({ ignoreChange: ignoreChange }, params))
                        .then(function (data) {
                            if (!data.emptySave) {
                                self.rechargeData(data.photo, data.can);

                                if (p.s() === statusKeys.NEW) {
                                    self.notifyReady();
                                }
                                if (data.reconvert) {
                                    self.notifyReconvert();
                                }

                                // Заново запрашиваем ближайшие фотографии
                                self.getNearestRibbon(12, self.applyNearestRibbon, self);
                            }
                        });
                },
                callback: function (result) {
                    if (_.get(result, 'done', false)) {
                        self.exe(false);
                        self.edit(false);
                        ga('send', 'event', 'photo', 'edit', 'photo edit ' + (result.error ? 'error' : 'success'));
                    }
                }
            });
        },

        revoke: function () {
            var self = this;

            if (!self.can.revoke()) {
                return false;
            }

            self.exe(true);
            noties.confirm({
                message: 'Фотография будет перемещена в корзину и не попадет в очередь на публикацию<br>Подтвердить операцию?',
                okText: 'Да',
                cancelText: 'Нет',
                onOk: function (initConfirmer) {
                    initConfirmer.disable();

                    var p = self.p;
                    var params = { cid: p.cid(), cdate: p.cdate(), s: p.s() };
                    self.tryOperation({
                        proceedText: 'Продолжить отзыв', confirmer: initConfirmer,
                        requestCreater: function (ignoreChange) {
                            return socket.run('photo.revoke', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                                self.rechargeData(data.photo, data.can);
                            });
                        },
                        callback: function (result) {
                            if (_.get(result, 'done', false)) {
                                self.exe(false);
                                ga('send', 'event', 'photo', 'revoke', 'photo revoke ' + (result.error ? 'error' : 'success'));
                                globalVM.router.navigate('/u/' + p.user.login() + '/photo');
                            }
                        }
                    });
                },
                onCancel: function () {
                    self.exe(false);
                }
            });
        },

        ready: function () {
            var self = this;
            var p = self.p;

            if (!self.can.ready()) {
                return false;
            }
            if (_.isEmpty(p.geo()) && _.isEmpty(p.regions())) {
                return self.askForGeo();
            }

            var params = { cid: p.cid(), cdate: p.cdate(), s: p.s() };
            self.tryOperation({
                proceedText: 'Продолжить отправку',
                requestCreater: function (ignoreChange) {
                    return socket.run('photo.ready', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                        self.rechargeData(data.photo, data.can);
                    });
                },
                callback: function (result) {
                    if (_.get(result, 'done', false)) {
                        self.exe(false);
                        ga('send', 'event', 'photo', 'ready', 'photo ready ' + (result.error ? 'error' : 'success'));
                    }
                }
            });
        },

        toRevision: function () {
            var self = this;

            if (!self.can.revision()) {
                return false;
            }

            self.exe(true);
            self.reasonSelect('photo.revision', 'Причина возврата', function (cancel, reason) {
                if (cancel) {
                    self.exe(false);
                    return;
                }

                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), reason: reason };
                self.tryOperation({
                    proceedText: 'Продолжить операцию возврата',
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.toRevision', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                            self.rechargeData(data.photo, data.can);
                        });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            self.exe(false);
                            ga('send', 'event', 'photo', 'revision', 'photo revision ' + (result.error ? 'error' : 'success'));
                        }
                    }
                });
            });
        },

        reject: function () {
            var self = this;

            if (!self.can.reject()) {
                return false;
            }

            self.exe(true);
            self.reasonSelect('photo.reject', 'Причина отклонения', function (cancel, reason) {
                if (cancel) {
                    return self.exe(false);
                }

                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), reason: reason };
                self.tryOperation({
                    proceedText: 'Продолжить отклонение',
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.rereject', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                            self.rechargeData(data.photo, data.can);
                        });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            self.exe(false);
                            ga('send', 'event', 'photo', 'reject', 'photo reject ' + (result.error ? 'error' : 'success'));
                        }
                    }
                });
            });
        },

        rereject: function () {
            var self = this;

            if (!self.can.rereject()) {
                return false;
            }

            self.exe(true);
            self.reasonSelect('photo.rereject', 'Причина восстановления', function (cancel, reason) {
                if (cancel) {
                    return self.exe(false);
                }

                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), reason: reason };
                self.tryOperation({
                    proceedText: 'Продолжить восстановление',
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.rereject', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                            self.rechargeData(data.photo, data.can);
                        });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            self.exe(false);
                            ga('send', 'event', 'photo', 'rereject', 'photo rereject ' + (result.error ? 'error' : 'success'));
                        }
                    }
                });
            });
        },

        approve: function () {
            var self = this;

            if (!self.can.approve()) {
                return false;
            }

            var p = self.p;
            var params = { cid: p.cid(), cdate: p.cdate(), s: p.s() };
            self.tryOperation({
                proceedText: 'Продолжить публикацию',
                requestCreater: function (ignoreChange) {
                    return socket.run('photo.approve', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                        self.rechargeData(data.photo, data.can);
                        self.commentsActivate({ checkTimeout: 100 });
                    });
                },
                callback: function (result) {
                    if (_.get(result, 'done', false)) {
                        self.exe(false);
                        ga('send', 'event', 'photo', 'approve', 'photo approve ' + (result.error ? 'error' : 'success'));
                    }
                }
            });
        },

        toggleDisable: function () {
            var self = this;
            var disable = self.can.deactivate();

            if (!disable && !self.can.activate()) {
                return false;
            }

            self.exe(true);

            if (disable) {
                self.reasonSelect('photo.deactivate', 'Причина деактивации', function (cancel, reason) {
                    if (cancel) {
                        self.exe(false);
                    } else {
                        request(reason);
                    }
                });
            } else {
                request();
            }

            function request(reason) {
                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), disable: disable, reason: reason };
                self.tryOperation({
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.activateDeactivate', _.assign({ ignoreChange: ignoreChange }, params))
                            .then(function (data) {
                                self.rechargeData(data.photo, data.can);
                            });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            self.exe(false);
                            var operation = p.s() === statusKeys.DEACTIVATE ? 'enabled' : 'disabled';
                            ga(
                                'send', 'event', 'photo', operation, 'photo ' + operation + (result.error ? 'error' : 'success')
                            );
                        }
                    }
                });
            }
        },

        remove: function () {
            var self = this;

            if (!self.can.remove()) {
                return false;
            }

            self.exe(true);
            self.reasonSelect('photo.remove', 'Причина удаления', function (cancel, reason) {
                if (cancel) {
                    return self.exe(false);
                }

                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), reason: reason };
                self.tryOperation({
                    proceedText: 'Продолжить удаление',
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.remove', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                            self.rechargeData(data.photo, data.can);
                        });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            ga('send', 'event', 'photo', 'delete', 'photo delete ' + (result.error ? 'error' : 'success'));

                            noties.alert({
                                message: 'Фотография удалена',
                                ok: true,
                                text: 'Завершить',
                                countdown: 5,
                                onOk: function () {
                                    globalVM.router.navigate('/u/' + p.user.login() + '/photo');
                                }
                            });
                        }
                    }
                });
            });
        },

        restore: function () {
            var self = this;

            if (!self.can.restore()) {
                return false;
            }

            self.exe(true);
            self.reasonSelect('photo.restore', 'Причина восстановления', function (cancel, reason) {
                if (cancel) {
                    return self.exe(false);
                }

                var p = self.p;
                var params = { cid: p.cid(), cdate: p.cdate(), s: p.s(), reason: reason };
                self.tryOperation({
                    proceedText: 'Продолжить восстановление',
                    requestCreater: function (ignoreChange) {
                        return socket.run('photo.restore', _.assign({ ignoreChange: ignoreChange }, params)).then(function (data) {
                            self.rechargeData(data.photo, data.can);
                        });
                    },
                    callback: function (result) {
                        if (_.get(result, 'done', false)) {
                            self.exe(false);
                            ga('send', 'event', 'photo', 'restore', 'photo restore ' + (result.error ? 'error' : 'success'));
                        }
                    }
                });
            });
        },

        toConvert: function () {
            var self = this;
            if (!self.can.convert()) {
                return false;
            }

            self.exe(true);

            socket.run('photo.convert', { cids: [this.p.cid()] }, true)
                .then(function (result) {
                    self.exe(false);

                    noties.alert({
                        message: _.get(result, 'message') || 'Отправлено',
                        layout: 'topRight'
                    });
                })
                .catch(function () {
                    self.exe(false);
                });
        },

        // Стандартная обработка поступающего массива лент фотографий,
        // если пришедшая фотография есть, она вставляется в новый массив
        processRibbonItem: function (incomingArr, targetArr) {
            var resultArr = [];
            var item;
            var itemExistFunc = function (element) {
                return element.cid === item.cid;
            };

            for (var i = 0; i < incomingArr.length; i++) {
                item = incomingArr[i];
                resultArr.push(_.find(targetArr, itemExistFunc) || Photo.factory(item, 'base', 'q'));
            }
            return resultArr;
        },

        // Берем ленту ближайших фотографий к текущей в галерее пользователя
        getUserRibbon: function (left, right, cb, ctx) {
            socket.run('photo.giveUserPhotosAround', { cid: this.p.cid(), limitL: left, limitR: right })
                .then(function (data) {
                    this.ribbonUserLeft = this.processRibbonItem(data.left.reverse(), this.ribbonUserLeft);
                    this.ribbonUserRight = this.processRibbonItem(data.right, this.ribbonUserRight);

                    cb.call(ctx, data);
                }.bind(this))
                .catch(function (error) {
                    console.error('While loading user ribbon:', error);
                });
        },
        applyUserRibbon: function () {
            var n = this.thumbNUser();
            var nLeft = Math.min(Math.max(Math.ceil(n / 2), n - this.ribbonUserRight.length), this.ribbonUserLeft.length);
            var newRibbon = this.ribbonUserLeft.slice(-nLeft);

            Array.prototype.push.apply(newRibbon, this.ribbonUserRight.slice(0, n - nLeft));
            this.userRibbon(this.setRibbonStatus(newRibbon));
        },
        setRibbonStatus: function (ribbon) {
            return _.each(ribbon, function (element) {
                element.status = statusNums[element.s] || {};
            });
        },

        // Берем ленту ближайщих на карте либо к текущей (если у неё есть координата), либо к центру карты
        getNearestRibbon: function (limit, cb, ctx) {
            if (this.nearestForCenterDebounced) {
                // Если уже есть обработчик на moveend, удаляем его
                this.mapVM.map.off('moveend', this.nearestForCenterDebounced, this);
                this.nearestForCenterDebounced = null;
            }

            if (this.p.geo()) {
                // Если у фото есть координата - берем ближайшие для неё
                this.receiveNearestRibbon(this.p.geo(), limit, this.p.cid(), cb, ctx);
            } else {
                // Если у фото нет координат - берем ближайшие к центру карты
                $.when(this.mapModulePromise).done(function () {
                    // Сразу берем, если зашли первый раз
                    this.nearestForCenter(limit, cb, ctx);
                    // Дебаунс для moveend карты
                    this.nearestForCenterDebounced = _.debounce(function () {
                        this.nearestForCenter(limit, cb, ctx);
                    }, 1500);
                    // Вешаем обработчик перемещения
                    this.mapVM.map.on('moveend', this.nearestForCenterDebounced, this);
                }.bind(this));
            }
        },
        nearestForCenter: function (limit, cb, ctx) {
            this.receiveNearestRibbon(Utils.geo.latlngToArr(this.mapVM.map.getCenter()), limit, undefined, cb, ctx);
        },
        receiveNearestRibbon: function (geo, limit, except, cb, ctx) {
            socket.run('photo.giveNearestPhotos', { geo: geo, limit: limit, except: except })
                .then(function (data) {
                    this.nearestRibbonOrigin = this.processRibbonItem(data.photos || [], this.nearestRibbonOrigin);
                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data);
                    }
                }.bind(this))
                .catch(function (error) {
                    console.error('While loading nearest ribbon:', error);
                });
        },
        applyNearestRibbon: function () {
            this.nearestRibbon(this.nearestRibbonOrigin);
        },

        processRanks: function (ranks) {
            var rank;
            var rnks = '';

            for (var r = 0; r < ranks.length; r++) {
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
            var self = this;
            var p = self.p;

            // Активируем комментарии, если фото не редактируется и разрешено комментировать
            if (!self.edit()/* && self.can.comment()*/ && p.s() >= statusKeys.PUBLIC) {
                self.commentsVM.activate(
                    {
                        cid: p.cid(),
                        count: p.ccount(),
                        countNew: p.ccount_new(),
                        subscr: p.subscr(),
                        nocomments: p.nocomments()
                    },
                    _.defaults(options || {}, {
                        instant: !!self.toComment || p.frags().length,
                        checkTimeout: p.ccount() > 30 ? 500 : 300
                    }),
                    function () {
                        // На случай наличия параметра подсветки фрагментов или комментариев вызываем scrollTo, после окончания receive
                        setTimeout(self.scrollToBind, 150);

                        // Если у нас есть новые комментарии, то нужно сбросить их количество,
                        // но только у оригинального ресурса, чтобы сейчас надпись новых отображалась,
                        // а при уходе и возврате уже нет
                        if (p.ccount_new()) {
                            self.originData.ccount_new = 0;
                        }
                    }
                );
            }
        },

        scrollToPhoto: function (duration, cb, ctx) {
            $window.scrollTo(this.$dom.find('.imgWrap'), {
                offset: -P.window.head,
                duration: duration || 400, onAfter: function () {
                    if (_.isFunction(cb)) {
                        cb.call(ctx);
                    }
                }
            });
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
                $window.scrollTo($element, {
                    offset: -P.window.head,
                    duration: 400, onAfter: function () {
                        this.highlightFrag(frag);
                    }.bind(this)
                });
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
            var $wrap = $('.imgMiddleWrap', this.$dom)
                .on('mouseenter', '.photoFrag', function (evt) {
                    var $frag = $(evt.target);
                    var fragOffset = $frag.offset();
                    var fragPosition = $frag.position();
                    var fragWidth = $frag.width();
                    var $comment = $('#c' + $frag.data('cid'), this.$dom);
                    var placement;

                    if ($comment.length === 1) {
                        $wrap
                            .addClass('fragHover')
                            .find('.photoImg')
                            .imgAreaSelect({
                                classPrefix: 'photoFragAreaShow imgareaselect',
                                x1: fragPosition.left,
                                y1: fragPosition.top,
                                x2: fragPosition.left + fragWidth + 2,
                                y2: fragPosition.top + $frag.height() + 2,
                                imageHeightScaled: this.hs(),
                                zIndex: 1,
                                parent: $wrap,
                                disable: true
                            });

                        if (fragOffset.left + fragWidth / 2 < 150) {
                            placement = 'right';
                        } else if ($(evt.delegateTarget).width() - fragOffset.left - fragWidth / 2 < 150) {
                            placement = 'left';
                        } else {
                            placement = 'bottom';
                        }
                        $frag
                            .popover({
                                title: $('.author', $comment).text(),
                                content: $('.ctext', $comment).text(),
                                placement: placement,
                                html: false,
                                delay: 0,
                                animation: false,
                                trigger: 'manual'
                            })
                            .popover('show');
                    }
                }.bind(this))
                .on('mouseleave', '.photoFrag', function (evt) {
                    $(evt.target).popover('destroy');
                    $wrap.removeClass('fragHover').find('.photoImg').imgAreaSelect({ remove: true });
                });
        },
        fragAreaCreate: function (selections) {
            if (!this.fragArea) {
                var $parent = this.$dom.find('.imgMiddleWrap');
                var ws = this.p.ws();
                var hs = this.p.hs();
                var ws2;
                var hs2;

                if (!selections) {
                    ws2 = ws / 2 >> 0;
                    hs2 = hs / 2;
                    selections = { x1: ws2 - 50, y1: hs2 - 50, x2: ws2 + 50, y2: hs2 + 50 };
                }

                this.fragArea = $parent.find('.photoImg')
                    .imgAreaSelect(_.assign({
                        classPrefix: 'photoFragAreaSelect imgareaselect',
                        imageWidth: ws,
                        imageHeight: hs, imageHeightScaled: this.hs(),
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
            var selection = this.fragAreaSelection(false);
            var result;

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
            this.p.frags.push(koMapping.fromJS(frag));
        },
        fragEdit: function (ccid, options) {
            var frag = this.fragGetByCid(ccid);
            var ws1percent = this.p.ws() / 100;
            var hs1percent = this.p.hs() / 100;

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
            this.p.frags(koMapping.fromJS({ arr: frags }).arr());
        },
        fragGetByCid: function (ccid) {
            return _.find(this.p.frags(), function (frag) {
                return frag.cid() === ccid;
            });
        },

        onPhotoLoad: function (event) {
            var img = event.target;
            var waterhs = this.p.waterhs();

            // Если реальные размеры фото не соответствуют тем что в базе, используем реальные
            if (_.isNumber(img.width) && this.p.ws() !== img.width) {
                this.p.ws(img.width);
            }
            if (_.isNumber(img.height) && this.p.hs() + waterhs !== img.height) {
                this.p.hs(img.height - waterhs);
            }
            this.photoSrc(this.p.sfile() + '?s=' + this.p.signs());
            this.sizesCalcPhoto();
            this.photoLoadContainer = null;
            this.photoLoading(false);
        },
        onPhotoError: function () {
            this.photoSrc('');
            this.photoLoadContainer = null;
            this.photoLoading(false);
        },
        onImgLoad: function (data, event) {
            $(event.target).animate({ opacity: 1 });
        },
        onAvatarError: function (data, event) {
            event.target.setAttribute('src', '/img/caps/avatar.png');
        },

        onPreviewLoad: function (data, event) {
            event.target.parentNode.parentNode.classList.add('showPrv');
        },
        onPreviewErr: function (data, event) {
            var $photoBox = $(event.target.parentNode);
            var parent = $photoBox[0].parentNode;
            var content = '';

            event.target.style.visibility = 'hidden';
            if (data.conv) {
                content = imgFailTpl({
                    style: 'padding-top: 20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;',
                    txt: ''
                });
            } else if (data.convqueue) {
                content = imgFailTpl({ style: '', txt: '<span class="glyphicon glyphicon-road"></span>' });
            } else {
                content = imgFailTpl({
                    style: 'width:24px; height:20px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                    txt: ''
                });
            }
            $photoBox.append(content);
            parent.classList.add('showPrv');
        },

        setMessage: function (text, abbr, labelMod, link) {
            this.msg(text || '');
            this.msgCss('label-' + (labelMod || 'default'));
            this.msgTitle(abbr || '');
            this.msgLink(link || '');
        }
    });
});
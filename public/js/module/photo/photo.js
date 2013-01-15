/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'm/Photo', 'm/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
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
            this.auth = globalVM.repository['m/auth'];
            this.p = Photo.vm(Photo.def.standard);
            this.userRibbon = ko.observableArray();
            this.userRibbonLeft = [];
            this.userRibbonRight = [];
            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

            this.mapEditVM = null;

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

            // Если фото новое и есть права, открываем его на редактирование
            this.edit = ko.observable(false);

            this.edit.subscribe(this.editHandler, this);
            P.settings.LoggedIn.subscribe(this.loginHandler, this);

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

            this.p.year.subscribe(function (val) {
                var v = parseInt(val, 10);
                if (!v || isNaN(v)) {
                    v = Photo.def.standard.year;
                }
                if (String(val) !== String(v)) {
                    this.p.year(v);
                    return;
                }
                if (v > parseInt(this.p.year2(), 10)) {
                    this.p.year2(v);
                }
            }, this);
            this.p.year2.subscribe(function (val) {
                var v = parseInt(val, 10);
                if (!v || isNaN(v)) {
                    v = Photo.def.standard.year;
                }
                if (String(val) !== String(v)) {
                    this.p.year2(v);
                    return;
                }
                if (v < this.p.year()) {
                    this.p.year2(this.p.year());
                    return;
                }
            }, this);

            this.thumbW = ko.observable('0px');
            this.thumbH = ko.observable('0px');
            this.thumbM = ko.observable('1px');
            this.userThumbN = ko.observable(3);
            P.window.square.subscribe(this.sizesCalc, this);

            ko.applyBindings(globalVM, this.$dom[0]);

            // Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
            // Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно, а последующие будут выстреливать сразу
            this.routeHandlerThrottled = _.throttle(this.routeHandler, 700);
            this.routeSubscription = globalVM.router.routeChanged.subscribe(this.routeHandlerThrottled, this);
            this.routeHandlerThrottled();
        },
        show: function () {
            if (this.showing) {
                return;
            }
            this.$container.fadeIn();
            this.sizesCalc(P.window.square());
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
            globalVM.pb.publish('/top/message', ['', 'muted']);
        },

        routeHandler: function () {
            var cid = globalVM.router.params().photo,
                appHistory = globalVM.router.getFlattenStack('/p/', ''),
                offset = globalVM.router.offset;

            storage.photo(cid, function (data) {
                if (data) {
                    this.originData = data.origin;
                    this.p = Photo.vm(data.origin, this.p);

                    // Если фото новое и есть права, открываем его на редактирование
                    this.edit(this.p.fresh() && this.IOwner());

                    this.show();
                    this.getUserRibbon(7, 7, this.applyUserRibbon, this);
                }
            }, this, this.p);
        },
        loginHandler: function (v) {
            // После логина/логаута перезапрашиваем ленту фотографий пользователя
            this.getUserRibbon(7, 7, this.applyUserRibbon, this);
        },
        editHandler: function (v) {
            if (v) {
                renderer(
                    [
                        {module: 'm/map/mapEdit', container: '.photoMap', options: {}, ctx: this, callback: function (vm) {
                            this.mapEditVM = vm;
                            this.mapEditPosition();
                        }}
                    ],
                    {
                        parent: this,
                        level: this.level + 1
                    }
                );
            }
        },

        sizesCalc: function (v) {
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

            this.applyUserRibbon();

            windowW = rightPanelW = thumbW = thumbH = null;
        },

        mapEditPosition: function () {
            this.mapEditVM.setGeo(this.p.geo());
        },

        editSave: function (data, event) {
            if (this.canBeEdit()) {
                if (!this.edit()) {
                    this.edit(true);
                } else {
                    this.exe(true);
                    this.save(function (data) {
                        if (!data.error) {
                            this.edit(false);
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

                                    okButton
                                        .text('Ok (4)')
                                        .on('click', function () {
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
                                    okButton
                                        .text('Close')
                                        .on('click', function () {
                                        $noty.close();
                                        this.exe(false);
                                    }.bind(this));
                                }
                            }.bind(that));
                            socket.emit('removePhotos', that.p.file());

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
                    if (this.originData[key] && (target[key] === this.originData[key])) {
                        delete target[key];
                    } else if (!this.originData[key] && (target[key] === Photo.def.standard[key])) {
                        delete target[key];
                    }
                }
            }
            if (Utils.getObjectPropertyLength(target) > 0) {
                target.cid = this.p.cid();
                socket.once('savePhotoResult', function (data) {
                    if (data && !data.error) {
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
        getUserRibbon: function (left, right, cb, ctx) {
            socket.once('takeUserPhotosAround', function (data) {
                if (!data || data.error) {
                    console.log('While loading user ribbon: ', data.message || 'Error occurred');
                } else {
                    var left = [],
                        right = [];
                    if (data.left && data.left.length > 0) {
                        data.left.reverse();
                        data.left.forEach(function (item) {
                            var existItem = _.find(this.userRibbonLeft, function (element) { return element.cid === item.cid; });
                            if (existItem) {
                                left.push(existItem);
                            } else {
                                Photo.factory(item, 'standard', 'mini');
                                left.push(item);
                            }
                        }, this);
                        this.userRibbonLeft = left;
                    }
                    if (data.right && data.right.length > 0) {
                        data.right.forEach(function (item) {
                            var existItem = _.find(this.userRibbonRight, function (element) { return element.cid === item.cid; });
                            if (existItem) {
                                right.push(existItem);
                            } else {
                                Photo.factory(item, 'standard', 'mini');
                                right.push(item);
                            }
                        }, this);
                        this.userRibbonRight = right;
                    }
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
/*global define:true*/
/**
 * Модель истории комментария
 */
define(
    ['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'm/photo/fields', 'm/photo/status', 'lib/doT', 'text!tpl/photo/hist.jade', 'css!style/photo/hist'],
    function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, fields, statuses, doT, jade) {
        'use strict';
        var tplHist;
        var tplRegions;
        var tplRegionsDiff;
        var maxRegionLevel = 5;
        var statusNums = statuses.nums;
        var infoFields = ['s', 'nocomments'];
        var txtFields = ['title', 'geo', 'regions', 'y', 'desc', 'source', 'author', 'address', 'dir'];

        return Cliche.extend({
            jade: jade,
            options: {
                cid: 0,
                scroll: 0,
                newSince: null
            },
            create: function () {
                this.cid = this.options.cid;
                this.scroll = this.options.scroll;
                this.newSince = this.options.newSince && this.options.newSince.getTime();
                this.fetchId = 0;
                this.showDiff = ko.observable(true);

                if (!tplHist) {
                    tplHist = doT.template(document.getElementById('dothist').text);
                }
                if (!tplRegions) {
                    tplRegions = doT.template(document.getElementById('dotRegions').text);
                }
                if (!tplRegionsDiff) {
                    tplRegionsDiff = doT.template(document.getElementById('dotRegionsDiff').text);
                }

                this.getHist(function (err, data) {
                    if (data && data.hists && data.hists.length) {
                        ko.applyBindings(globalVM, this.$dom[0]);
                        this.renderHist(data);
                    }
                    this.show();

                }, this);
            },
            show: function () {
                var self = this;
                globalVM.func.showContainer(self.$container);

                self.scrollByParams();

                if (self.modal) {
                    self.modal.$curtain.addClass('showModalCurtain');
                }
                self.showing = true;
            },
            hide: function () {
                globalVM.func.hideContainer(this.$container);
                this.showing = false;
            },
            switchDiff: function () {
                this.showDiff(!this.showDiff());

                this.getHist(function (err, data) {
                    if (data && data.hists && data.hists.length) {
                        this.renderHist(data);
                    }
                }, this);
            },
            scrollByParams: function (soft) {
                var self = this;
                var dom = self.$dom[0];
                var $container = self.$container;
                var viewHeight = $container.height();
                var contentHeight = $container[0].scrollHeight;
                var element;
                var elementHeight;
                var elementTop;

                if (self.scroll > 1) {
                    element = self.setHl(self.scroll);
                }

                if (contentHeight > viewHeight) {
                    // Если в параметре scroll пришло число больше единцы, значит это stamp нужной записи истории
                    // Если такая запись нашлась навигируемся к ней
                    if (element) {
                        element = $(element);

                        //Если высота комментария меньше высоты контейнера, позиционируем комментарий по центру контейнера
                        elementHeight = element.outerHeight();
                        elementTop = element.position().top;
                        if (elementHeight < viewHeight) {
                            elementTop += elementHeight / 2 - viewHeight / 2;
                        }
                    }

                    // Если с момента последнего посещения добавились новые записи в историю и нет навигируемой записи scroll,
                    // Навигируемся к первой новой записи
                    if (self.newSince > 0 && !element) {
                        element = dom.querySelector('.isnew');
                        if (element) {
                            elementTop = $(element).position().top - 10;
                        }
                    }
                    // Если на предыдцщих шагах ничего не нашли и стоит значение скроллить в конец, скроллимся
                    if (self.scroll === 1 && !element) {
                        elementTop = contentHeight;
                    }

                    // Если элемент найден, скроллим к нему
                    if (elementTop) {
                        if (soft) {
                            $container.scrollTo(elementTop, 400);
                        } else {
                            $container[0].scrollTop = elementTop;
                        }
                    }
                }
            },
            setNewScroll: function (scroll) {
                this.scroll = scroll;
                $('.hist.hl', this.$dom).removeClass('hl');
                this.scrollByParams(true);
            },
            setHl: function (stamp) {
                var element = this.$dom[0].querySelector('#h' + stamp);
                if (element) {
                    element.classList.add('hl');
                }
                return element;
            },
            renderHist: function (data) {
                var regionsHash = data.regions;
                var reasonsHash = data.reasons;
                var showDiff = this.showDiff();
                var regionsPrev;
                var regionsArr;
                var regionCids;
                var regionPrev;
                var regionCurr;
                var regionsBase;
                var regionsDel;
                var regionsAdd;
                var value;
                var hist;
                var j;

                var newSince = this.newSince;
                var hightlightNew = newSince > 0;

                for (var i = 0; i < data.hists.length; i++) {
                    hist = data.hists[i];

                    // Если указано время последнего просмотра объекта и это не первая запись,
                    // Подсвечиваем все записи после этого времени как новые
                    if (hightlightNew && i > 0 && hist.stamp >= newSince) {
                        hist.isnew = true;
                    }

                    hist.user.avatar = hist.user.avatar ? P.preaddr + '/_a/h/' + hist.user.avatar : '/img/caps/avatarth.png';

                    if (hist.roleregion) {
                        hist.roleregion = regionsHash[hist.roleregion];
                    }

                    hist.txtValues = [];

                    if (!hist.values) {
                        hist.values = {};
                    } else {
                        regionCids = hist.values.regions && hist.values.regions.val;

                        if (regionCids) {
                            regionsArr = [];
                            regionsBase = [];
                            regionsDel = [];
                            regionsAdd = [];

                            for (j = 0; j < regionCids.length; j++) {
                                regionsArr.push(regionsHash[regionCids[j]]);
                            }

                            if (showDiff && regionsPrev) {
                                for (j = 0; j <= maxRegionLevel; j++) {
                                    regionPrev = regionsPrev[j];
                                    regionCurr = regionsArr[j];

                                    if (!regionPrev && !regionCurr) {
                                        break;
                                    }

                                    if (regionPrev && regionCurr && regionPrev.cid === regionCurr.cid) {
                                        regionsBase.push(regionCurr);
                                    } else {
                                        if (regionPrev) {
                                            regionsDel.push(regionPrev);
                                        }
                                        if (regionCurr) {
                                            regionsAdd.push(regionCurr);
                                        }
                                    }
                                }

                                hist.values.regions.txt = tplRegionsDiff({
                                    base: tplRegions(regionsBase),
                                    del: tplRegions(regionsDel),
                                    add: tplRegions(regionsAdd)
                                });
                            } else {
                                hist.values.regions.txt = tplRegions(regionsArr);
                            }

                            regionsPrev = regionsArr;
                        }

                        if (hist.values.dir && hist.values.dir.val) {
                            hist.values.dir.txt = fields.dirVals[hist.values.dir.val];
                        }

                        if (hist.values.s) {
                            hist.s = statusNums[hist.values.s.val];
                        }

                        for (j = 0; j < txtFields.length; j++) {
                            value = hist.values[txtFields[j]];
                            if (value) {
                                value.field = txtFields[j];
                                value.txt = value.txt || value.val;
                                hist.txtValues.push(value);
                            }
                        }
                    }
                }

                this.$dom[0].querySelector('.hists').innerHTML = tplHist({
                    cid: this.cid,
                    hists: data.hists,
                    fields: fields,
                    reasonsHash: reasonsHash,
                    fDate: Utils.format.date.relative
                });
            },
            getHist: function (cb, ctx) {
                this.fetchId += 1;

                socket.once('takeObjHist', function (data) {
                    // Проверяем что запрос не устарел
                    if (data && data.fetchId !== this.fetchId) {
                        return;
                    }

                    var error = !data || data.error || !Array.isArray(data.hists);

                    if (error) {
                        window.noty({
                            text: data && data.message || 'Error occurred',
                            type: 'error',
                            layout: 'center',
                            timeout: 3000,
                            force: true
                        });
                    }

                    cb.call(ctx, error, data);
                }, this);

                socket.emit('giveObjHist', { cid: this.cid, showDiff: this.showDiff(), fetchId: this.fetchId });
            }
        });
    });
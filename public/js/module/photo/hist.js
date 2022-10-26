/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(
    ['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'm/photo/fields', 'm/photo/status', 'lib/doT', 'text!tpl/photo/hist.pug', 'css!style/photo/hist'],
    function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, fields, statuses, doT, pug) {
        'use strict';

        let tplHist;
        let tplRegions;
        let tplRegionsDiff;
        const maxRegionLevel = 5;
        const statusNums = statuses.nums;
        const txtFields = ['title', 'geo', 'type', 'regions', 'y', 'desc', 'source', 'author', 'address', 'dir', 'watersignText'];

        return Cliche.extend({
            pug: pug,
            options: {
                cid: 0,
                scroll: 0,
                newSince: null,
            },
            create: function () {
                this.cid = this.options.cid;
                this.scroll = this.options.scroll;
                this.newSince = this.options.newSince && this.options.newSince.getTime();
                this.fetchId = 0;
                this.haveDiff = ko.observable(false);
                this.showDiff = ko.observable(true);
                this.switchDiff2 = ko.observable(false);

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
                const self = this;

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
                const self = this;
                const dom = self.$dom[0];
                const $container = self.$container;
                const viewHeight = $container.height();
                const contentHeight = $container[0].scrollHeight;
                let element;
                let elementHeight;
                let elementTop;

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
                const element = this.$dom[0].querySelector('#h' + stamp);

                if (element) {
                    element.classList.add('hl');
                }

                return element;
            },
            renderHist: function (data) {
                const regionsHash = data.regions;
                const reasonsHash = data.reasons;
                const showDiff = this.showDiff();
                let regionsPrev;
                let regionsArr;
                let regionCids;
                let regionPrev;
                let regionCurr;
                let regionsBase;
                let regionsDel;
                let regionsAdd;
                let addHash;
                let field;
                let value;
                let hist;
                let j;

                const newSince = this.newSince;
                const hightlightNew = newSince > 0;

                for (let i = 0; i < data.hists.length; i++) {
                    hist = data.hists[i];

                    // Если указано время последнего просмотра объекта и это не первая запись,
                    // Подсвечиваем все записи после этого времени как новые
                    if (hightlightNew && i > 0 && hist.stamp > newSince) {
                        hist.isnew = true;
                    }

                    hist.user.avatar = hist.user.avatar ? '/_a/h/' + hist.user.avatar : '/img/caps/avatarth.png';

                    if (hist.roleregion) {
                        hist.roleregion = regionsHash[hist.roleregion];
                    }

                    hist.textValuesArr = [];

                    if (!hist.values) {
                        hist.values = {};
                    } else {
                        if (hist.values.s !== undefined) {
                            hist.values.s = statusNums[hist.values.s];
                        }

                        regionCids = hist.values.regions;

                        if (regionCids) {
                            regionsArr = [];
                            regionsBase = [];
                            regionsDel = [];
                            regionsAdd = [];

                            for (j = 0; j < regionCids.length; j++) {
                                if (!_.isEmpty(regionsHash[regionCids[j]])) {
                                    regionsArr.push(regionsHash[regionCids[j]]);
                                }
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

                                hist.values.regions = tplRegionsDiff({
                                    base: tplRegions(regionsBase),
                                    del: tplRegions(regionsDel),
                                    add: tplRegions(regionsAdd),
                                });
                            } else {
                                hist.values.regions = tplRegions(regionsArr);
                            }

                            regionsPrev = regionsArr;
                        }

                        if (hist.values.type) {
                            hist.values.type = fields.typeVals[hist.values.type];
                        }

                        if (hist.values.dir) {
                            hist.values.dir = fields.dirVals[hist.values.dir];
                        }

                        if (hist.add) {
                            addHash = {};

                            for (j = 0; j < hist.add.length; j++) {
                                addHash[hist.add[j]] = true;
                            }
                        }

                        for (j = 0; j < txtFields.length; j++) {
                            field = txtFields[j];
                            value = hist.values[field];

                            if (value) {
                                // doT не умеет итерироваться по объектам, превращаем в массив
                                hist.textValuesArr.push({
                                    field: field,
                                    val: value,
                                    add: addHash && addHash[field],
                                });
                            }
                        }

                        addHash = undefined;
                    }
                }

                this.$dom[0].querySelector('.hists').innerHTML = tplHist({
                    cid: this.cid,
                    fields: fields,
                    hists: data.hists,
                    reasonsHash: reasonsHash,
                    fDate: Utils.format.date.relative,
                });
            },
            getHist: function (cb, ctx) {
                const self = this;

                self.fetchId += 1;

                socket
                    .run('photo.giveObjHist', {
                        cid: self.cid,
                        fetchId: self.fetchId,
                        showDiff: self.showDiff(),
                    }, true)
                    .then(function (result) {
                        // Проверяем что запрос не устарел
                        if (_.get(result, 'fetchId') !== self.fetchId) {
                            return;
                        }

                        if (result.haveDiff === true) {
                            self.haveDiff(result.haveDiff);
                        }

                        self.switchDiff2(result.hists.length > 4);

                        cb.call(ctx, null, result);
                    })
                    .catch(function (err) {
                        cb.call(ctx, err);
                    });
            },
        });
    });

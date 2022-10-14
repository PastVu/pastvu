/*global define:true*/

/**
 * Модель списка регионов
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM',
    'model/storage', 'noties', 'text!tpl/admin/regionList.pug', 'css!style/admin/regionList',
], function (_, $, Utils, socket, P, ko, Cliche, globalVM, storage, noties, pug) {
    'use strict';

    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.regions = ko.observableArray();
            this.regionsFlat = this.regions();
            this.regionsByYear = ko.observableArray();
            this.dateItemsFlat = [];
            this.mode = ko.observable(Utils.getLocalStorage('regionList.mode') || 'inheritence'); // inheritence, cdate, udate, gdate
            this.sort = ko.observable(Utils.getLocalStorage('regionList.sort') || 1);
            this.stat = null;

            this.getRegions(function () {
                ko.applyBindings(globalVM, this.$dom[0]);
                this.show();

                this.subscriptions.mode = this.mode.subscribe(this.handleModeChange, this);
                this.subscriptions.sort = this.sort.subscribe(this.handleSortChange, this);
                this.scrolltoHighLight();
            }, this);
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        scrolltoHighLight: function () {
            if (this.reallyHL) {
                window.setTimeout(function () {
                    const element = this.$dom.find('.lirow.hl');

                    if (element && element.length) {
                        $(window).scrollTo(this.$dom.find('.lirow.hl'), { offset: -P.window.head - 8, duration: 400 });
                    }
                }.bind(this), 100);
            }
        },
        getRegions: function (cb, ctx) {
            socket.run('region.giveListFull', {}, true)
                .then(function (data) {
                    this.stat = data.stat;
                    this.regions(this.treeBuild(data.regions));
                    this.regionsFlat = data.regions;

                    if (this.mode() !== 'inheritence') {
                        this.treeBuildDate(this.mode());
                    } else if (this.sort() === -1) {
                        this.sortInheritanceMode();
                    }

                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data);
                    }
                }.bind(this));
        },
        handleModeChange: function (val) {
            if (val === 'inheritence') {
                this.regionsByYear([]);
                this.sortInheritanceMode();
            } else {
                this.treeBuildDate(val);
            }

            Utils.setLocalStorage('regionList.mode', val);
            this.scrolltoHighLight();
        },
        handleSortChange: function (val) {
            const mode = this.mode();

            if (mode === 'inheritence') {
                this.sortInheritanceMode();
            } else {
                this.treeBuildDate(this.mode());
            }

            Utils.setLocalStorage('regionList.sort', val);
            this.scrolltoHighLight();
        },
        sortInheritanceMode: function () {
            const sort = this.sort();

            (function recursiveSort(arr) {
                arr.sort(function (a, b) {
                    return sort * collator.compare(a.title_en, b.title_en);
                });

                arr = arr();

                for (let i = 0; i < arr.length; i++) {
                    recursiveSort(arr[i].regions);
                }
            }(this.regions));
        },
        treeBuild: function (arr) {
            let i = 0;
            const len = arr.length;
            const hash = {};
            let region;
            const results = [];
            const cidHL = Number(globalVM.router.params().hl);

            this.reallyHL = false;

            //Сортируем массим по уровням и названиям в пределах одного уровня
            arr.sort(function (a, b) {
                if (a.parents.length === b.parents.length) {
                    return collator.compare(a.title_en, b.title_en);
                }

                return a.parents.length < b.parents.length ? -1 : 1;
            });

            function incrementParentsChildLen(region, deepestLevel) {
                const parentRegion = region.parent;
                const parentChildsArrPosition = deepestLevel - parentRegion.level - 1;

                //Если открыт дочерний, надо открыть и родителя
                if (region.opened()) {
                    parentRegion.opened(true);
                }

                parentRegion.childLenAll += 1;
                parentRegion.childLenArr[parentChildsArrPosition] = -~parentRegion.childLenArr[parentChildsArrPosition];

                if (parentRegion.parent) {
                    incrementParentsChildLen(parentRegion, deepestLevel);
                }
            }

            for (; i < len; i++) {
                region = arr[i];
                region.regions = ko.observableArray();
                region.cdateDate = new Date(region.cdate);

                if (region.udate) {
                    region.udateDate = new Date(region.udate);
                }

                if (region.gdate) {
                    region.gdateDate = new Date(region.gdate);
                }

                region.level = region.parents.length;
                region.childLen = 0; //Количество непосредственных потомков
                region.childLenAll = 0; //Количество всех потомков
                region.childLenArr = [0]; //Массив количеств потомков
                region.hl = cidHL === region.cid; //Подсветка региона по переданному параметру
                region.opened = ko.observable(region.hl); //Подсвеченный регион должен быть открыт

                if (region.level) {
                    region.parent = hash[region.parents[region.level - 1]];
                    region.parent.regions.push(region);
                    region.parent.childLen += 1;
                    incrementParentsChildLen(region, region.level);
                } else {
                    results.push(region);
                }

                if (region.hl) {
                    this.reallyHL = true;
                }

                hash[region.cid] = region;
            }

            return results;
        },
        treeBuildDate: function (field) {
            let date;
            let year;
            let month;
            let region;
            const result = {};
            const fieldDate = field + 'Date';

            const sort = this.sort();
            const regions = this.regionsFlat.slice();

            this.dateItemsFlat = [];

            // Sort by given date, undefined values to the end
            regions.sort(function (a, b) {
                const aval = a[field];

                if (!aval) {
                    return sort;
                }

                const bval = b[field];

                if (!bval) {
                    return -sort;
                }

                return aval > bval ? sort : -sort;
            });

            for (let i = 0; i < regions.length; i++) {
                region = regions[i];

                if (region[field]) {
                    date = region[fieldDate];

                    year = date.getFullYear();
                    month = date.getMonth();

                    if (!result[year]) {
                        result[year] = { sort: year, title: year, count: 0, children: {}, opened: ko.observable(false), level: 0 };
                        this.dateItemsFlat.push(result[year]);
                    }

                    if (!result[year].children[month]) {
                        result[year].children[month] = { sort: month, title: months[month], count: 0, regions: [], opened: ko.observable(false), level: 1 };
                        this.dateItemsFlat.push(result[year].children[month]);
                    }

                    result[year].count++;
                    result[year].children[month].count++;
                    result[year].children[month].regions.push(region);

                    if (region.hl) {
                        result[year].opened(true);
                        result[year].children[month].opened(true);
                    }
                } else {
                    if (!result.no) {
                        result.no = { sort: 0, title: 'Never', count: 0, regions: [], opened: ko.observable(false), level: 0 };
                        this.dateItemsFlat.push(result.no);
                    }

                    result.no.count++;
                    result.no.regions.push(region);

                    if (region.hl) {
                        result.no.opened(true);
                    }
                }
            }

            function toArray(obj) {
                return _.transform(obj, function (result, item) {
                    result.push(item);

                    if (item.children) {
                        item.children = toArray(item.children);
                    }
                }, []).sort(function (a, b) {
                    return a.sort > b.sort ? sort : -sort;
                });
            }

            this.regionsByYear(toArray(result));
        },
        collapseToggle: function (data/*, event*/) {
            data.opened(!data.opened());
        },
        expandAll: function (/*data, event*/) {
            this.collapseToggleAll(true);
        },
        collapseAll: function (/*data, event*/) {
            this.collapseToggleAll(false);
        },
        collapseToggleAll: function (expand) {
            const items = this.mode() === 'inheritence' ? this.regionsFlat : this.dateItemsFlat;

            for (let i = items.length - 1; i >= 0; i--) {
                items[i].opened(expand);
            }
        },

        recalcStats: function () {
            const that = this;

            noties.confirm({
                message: 'Перерасчет статистики регионов займет ~5 минут. Продолжить?',
                okText: 'Да, налью чаю',
                okClass: 'btn-success',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('region.recalcStatistics', {})
                        .then(function (data) {
                            let msg;

                            if (data.running) {
                                msg = 'В данный момент статистика уже пересчитывается';
                            } else {
                                msg = 'Статистика регионам пересчитана<br>';

                                if (data.valuesChanged) {
                                    if (data.regionChanged) {
                                        msg += '<b>' + globalVM.intl.num(data.regionChanged) + '</b> регионов было обновлено<br>';
                                    }

                                    msg += '<b>' + globalVM.intl.num(data.valuesChanged) + '</b> значений было изменено';
                                } else {
                                    msg += 'Значения не изменились';
                                }
                            }

                            confirmer.success(msg, 'Ok', null, function () {
                                that.getRegions();
                            });
                        })
                        .catch(function (error) {
                            confirmer.error(error, 'Закрыть');
                        });
                },
                cancelText: 'Нет',
            });
        },
    });
});

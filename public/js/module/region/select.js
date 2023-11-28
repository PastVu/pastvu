/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/* global Bloodhound: true */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'model/storage', 'noties', 'text!tpl/region/select.pug', 'css!style/region/select', 'bs/ext/tokenfield',
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, storage, noties, pug) {
    'use strict';

    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    const $window = $(window);
    let cache = null;

    return Cliche.extend({
        pug: pug,
        options: {
            min: 1,
            max: 10,
            selectedInit: [],
            topCidsFilter: [],
            neverSelectable: [],
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.loading = ko.observable(!cache);

            this.isSticked = false;

            this.topCidsFilter = this.options.topCidsFilter;
            this.neverSelectable = this.options.neverSelectable.reduce(function (hash, cid) {
                hash[cid] = true;

                return hash;
            }, Object.create(null));

            this.selectedInit = this.options.selectedInit;
            this.selectedInitHash = {};
            this.selectedInitTkns = [];

            if (this.selectedInit && this.selectedInit.length) {
                this.selectedInit.forEach(function (region) {
                    this.selectedInitHash[region.cid] = region;
                    this.selectedInitTkns.push({ cid: region.cid, value: region.title_en });
                }, this);
            }

            this.regionsTree = ko.observableArray();
            this.regionsTypehead = [];
            this.regionsHashByCid = {};

            this.sortBy = ko.observable(Utils.getLocalStorage('regionSelect.sortBy') || 'alphabet'); // alphabet, sub, photo, pic, comment
            this.sortOrder = ko.observable(Utils.getLocalStorage('regionSelect.sortOrder') || 1); // 1, -1

            this.pinHomeAllowed = this.auth.loggedIn() && this.auth.iAm.regionHome.cid() && this.topCidsFilter.length === 0;

            const pinHome = this.pinHomeAllowed ? Utils.getLocalStorage('regionSelect.pinHome') : false;

            this.pinHome = ko.observable(typeof pinHome === 'boolean' ? pinHome : true);

            this.clickNode = this.clickNode.bind(this);

            if (!cache) {
                // If there is no cached data, show modal to see loading indicator
                this.show();
            }

            this.getRegions(function (regions) {
                this.regionsTree(this.sortTree(this.treeBuild(regions))());

                if (!this.showing) {
                    // If data has been cached, show modal after data was prepared (no need to show loading)
                    this.show();
                }

                this.subscriptions.sortBy = this.sortBy.subscribe(this.handleSortChange, this);
                this.subscriptions.sortOrder = this.sortOrder.subscribe(this.handleSortChange, this);
                this.subscriptions.pinHome = this.pinHome.subscribe(this.handlePinChange, this);

                // Создавать токены должны после отображения, чтобы появился скроллинг и правильно посчиталась ширина инпута для typehead
                setTimeout(function () {
                    this.loading(false);
                    this.createTokenfield();

                    this.subscriptions.sizes = P.window.square.subscribe(this.sizeHandler, this);
                    this.affixInputOn();
                }.bind(this), 25);
            }, this);
        },
        show: function () {
            ko.applyBindings(globalVM, this.$dom[0]);

            globalVM.func.showContainer(this.$container);

            if (this.modal) {
                this.modal.$curtain.addClass('showModalCurtain');
            }

            this.showing = true;
        },
        hide: function () {
            this.affixInputOff();
            this.$dom.find('.regionstkn').tokenfield('destroy');
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        sizeHandler: function () {
            //При ресайзе надо влючить заново affix, чтобы пересчитать референсные значения
            this.affixInputOff();
            window.setTimeout(function () {
                this.affixInputOn();
            }.bind(this), 10);
        },
        //Включаем "прилипание" поля ввода при скроллинге к верхнему краю модального окна
        affixInputOn: function () {
            const _this = this;
            const $container = this.$container;
            const $sticker = this.$dom.find('.inputwrap.origin');

            const stickAfter = $sticker.position().top;
            const stickFixedTop = $container.offset().top - $window.scrollTop() + 7;
            const stickFixedLeft = $sticker.offset().left - $window.scrollLeft() - 44;
            const stickFixedWidth = $sticker.width() + 21 + 21;

            const calcValues = function () {
                const scrollUnder = $container.scrollTop() > stickAfter;

                if (!_this.isSticked && scrollUnder) {
                    _this.sticker.style.top = stickFixedTop + 'px';
                    _this.sticker.style.left = stickFixedLeft + 'px';
                    _this.sticker.style.width = stickFixedWidth + 'px';
                    _this.surrogate.style.height = $sticker.height() + 10 + 'px';

                    _this.sticker.classList.add('sticked');
                    _this.surrogate.classList.add('sticked');
                    _this.topShadowBacking.classList.add('doit');

                    _this.isSticked = true;
                } else if (_this.isSticked && !scrollUnder) {
                    _this.unstickInput();
                }
            };

            this.sticker = $sticker[0];
            this.surrogate = this.$dom.find('.inputwrap.surrogate')[0];
            this.topShadowBacking = $container.parent().find('.tsb')[0]; //Подложка под верхнюю тень тулбара модального окна

            calcValues(); //Считаем при первом вызове, например, чтобы пересчитать после ресайза окна
            $container.on('scroll', calcValues);
        },
        unstickInput: function () {
            if (this.isSticked) {
                this.sticker.style.top = 'auto';
                this.sticker.style.left = 'auto';
                this.sticker.style.width = 'auto';

                this.sticker.classList.remove('sticked');
                this.surrogate.classList.remove('sticked');
                this.topShadowBacking.classList.remove('doit');

                this.isSticked = false;
            }
        },
        affixInputOff: function () {
            this.$container.off('scroll');
            this.unstickInput();
            delete this.sticker;
            delete this.surrogate;
            delete this.topShadowBacking;
        },
        getRegions: function (cb, ctx) {
            if (cache) {
                cb.call(ctx, JSON.parse(cache.regions));
            } else {
                socket.run('region.giveListPublicString', undefined, true)
                    .then(function (data) {
                        cache = data;
                        cb.call(ctx, JSON.parse(data.regions));

                        setTimeout(function () {
                            cache = null;
                        }, 60000);
                    });
            }
        },
        //Возвращает массив выбранных регионов с переданными полями
        getSelectedRegions: function (fields) {
            const tkn = this.$dom.find('.regionstkn');
            const tokens = tkn.tokenfield('getTokens');
            const result = [];

            tokens.forEach(function (item) {
                const region = this.regionsHashByCid[item.cid];

                if (region && region.exists) {
                    result.push(fields ? _.pick(region, fields) : region);
                }
            }, this);

            return result;
        },
        //Возвращает массив выбранных регионов с родителями с переданными полями
        getSelectedRegionsFull: function (fields) {
            const tkn = this.$dom.find('.regionstkn');
            const tokens = tkn.tokenfield('getTokens');
            const results = [];

            tokens.forEach(function (item) {
                const region = this.regionsHashByCid[item.cid];

                if (region && region.exists) {
                    const result = [];

                    //Если есть родительские, то вставляем и их
                    if (region.parents && region.parents.length) {
                        region.parents.forEach(function (cid) {
                            const region = this.regionsHashByCid[cid];

                            if (region && region.exists) {
                                result.push(fields ? _.pick(region, fields) : region);
                            }
                        }, this);
                    }

                    result.push(fields ? _.pick(region, fields) : region);
                    results.push(result);
                }
            }, this);

            return results;
        },
        //Возвращает массив cid выбранных регионов
        getSelectedCids: function () {
            const tkn = this.$dom.find('.regionstkn');
            const tokens = tkn.tokenfield('getTokens');
            const result = [];

            tokens.forEach(function (item) {
                const region = this.regionsHashByCid[item.cid];

                if (region && region.exists) {
                    result.push(region.cid);
                }
            }, this);

            return result;
        },
        getRegionsByCids: function (cids, fields) {
            const regionsHashByCid = this.regionsHashByCid;

            return cids.map(function (cid) {
                return fields ? _.pick(regionsHashByCid[cid], fields) : regionsHashByCid[cid];
            }, {});
        },
        getRegionsHashByCids: function (cids, fields) {
            const regionsHashByCid = this.regionsHashByCid;

            return cids.reduce(function (result, cid) {
                result[cid] = fields ? _.pick(regionsHashByCid[cid], fields) : regionsHashByCid[cid];

                return result;
            }, {});
        },
        createTokenfield: function () {
            const engine = new Bloodhound({
                local: this.regionsTypehead, /*[{cid: 2, value: 'США', tokens: ['2', 'USA', 'США']}]*/
                datumTokenizer: function (d) {
                    // Join all tokens using space and tokenise using whitespace.
                    return Bloodhound.tokenizers.whitespace(d.tokens.join(' '));
                },
                queryTokenizer: Bloodhound.tokenizers.whitespace,
                identify: function (obj) {
                    return obj.cid;
                }, // Unique id.
            });

            engine.initialize();

            this.$dom.find('.regionstkn')
                .tokenfield({
                    createTokensOnBlur: false,
                    minLength: 1,
                    minWidth: 200,
                    limit: 10,
                    tokens: this.selectedInitTkns,
                    typeahead: [{
                        highlight: true,
                    }, {
                        name: 'regions',
                        displayKey: 'value',
                        limit: 10,
                        templates: {
                            'suggestion': function (context) {
                                const title = `<p>${context.value}</p>`;

                                return title + (context.parentTitle ? `<p style="color: #aaa; font-size 0.9em">${context.parentTitle}</p>` : '');
                            },
                        },
                        source: engine.ttAdapter(),
                    }],
                })
                .on('tokenfield:createdtoken', this.onCreateToken.bind(this)) //При создании токена добавляем выбор
                .on('tokenfield:edittoken tokenfield:removedtoken', this.onRemoveToken.bind(this)) //При удалении или редиктировании токена удаляем выбор
                .on('tokenfield:createtoken', function (e) {
                    // Prevent duplicated tokens.
                    const existingTokens = $(this).tokenfield('getTokens');

                    $.each(existingTokens, function (index, token) {
                        if (token.cid === e.attrs.cid) {
                            e.preventDefault();
                        }
                    });
                    $(this).tokenfield('setInput', '');
                });
        },
        // Событие создания токена. Вызовется как при создании в поле,
        // так и при удалении из дерева (потому что при этом пересоздаются неудаляемые токены).
        onCreateToken: function (e) {
            const region = this.regionsHashByCid[e.attrs.cid];

            if (region && region.exists) {
                //Если регион уже выбран, значит, мы создаем токен вручную после клика по узлу дерева
                //или пересоздаем после удаления одного из токенов и ничего делать не надо
                if (!region.selected()) {
                    if (this.selectRegion(region)) {
                        this.nodeToggle(region, true, true, 'up'); //При успешном выборе региона из поля, раскрываем его ветку в дереве
                    } else {
                        this.removeToken(region); //Если выбор не возможен, удаляем этот токен
                    }
                }
            } else {
                $(e.relatedTarget).addClass('invalid').attr('title', 'No such region');
            }
        },
        //Событие удаления токена непосредственно из поля
        onRemoveToken: function (e) {
            const region = this.regionsHashByCid[e.attrs.cid];

            if (region && region.exists) {
                region.selected(false);
                this.toggleBranchSelectable(region, true);
            }
        },
        //Ручное удаление токена, работает полной заменой токенов, кроме удаляемого.
        //Поэтому для удаляемого токена событие onRemoveToken не сработает, но сработает onCreateToken для каждого неудаляемого
        removeToken: function (region) {
            const cid = region.cid;
            const tkn = this.$dom.find('.regionstkn');
            const tokensExists = tkn.tokenfield('getTokens');

            _.remove(tokensExists, function (item) {
                return item.cid === cid;
            });
            tkn.tokenfield('setTokens', tokensExists);
        },

        selectRegion: function (region) {
            if (this.neverSelectable[region.cid] !== undefined) {
                return false;
            }

            if (this.checkBranchSelected(region)) {
                noties.alert({
                    message: 'You can not choose the parent and child regions simultaneously',
                    type: 'warning',
                    timeout: 4000,
                    ok: true,
                });

                return false;
            }

            region.selected(true);
            this.toggleBranchSelectable(region, false);

            return true;
        },
        //Клик по узлу дерева
        clickNode: function (region) {
            if (!region.selectable()) {
                return;
            }

            const add = !region.selected();
            const tkn = this.$dom.find('.regionstkn');

            if (add) {
                if (this.selectRegion(region)) {
                    tkn.tokenfield('createToken', { cid: region.cid, value: region.title_en });
                }
            } else {
                region.selected(false);
                this.removeToken(region);
                this.toggleBranchSelectable(region, true);
            }
        },
        //Проверяем, выбран ли какой-то другой регион в ветке, в которой находится переданный регион
        checkBranchSelected: function (region) {
            return uprecursive(region.parent) || downrecursive(region.regions());

            function uprecursive(region) {
                return region && (region.selected() || uprecursive(region.parent));
            }

            function downrecursive(regions) {
                if (regions && regions.length) {
                    for (let i = regions.length; i--;) {
                        if (regions[i].selected() || downrecursive(regions[i].regions())) {
                            return true;
                        }
                    }
                }

                return false;
            }
        },
        //Ставит selectable всем в ветке, в которой находится переданный регион
        toggleBranchSelectable: function (region, selectable) {
            const neverSelectable = this.neverSelectable;

            return uprecursive(region.parent) || downrecursive(region.regions());

            function uprecursive(region) {
                if (region && neverSelectable[region.cid] === undefined) {
                    region.selectable(selectable);
                    uprecursive(region.parent);
                }
            }

            function downrecursive(regions) {
                if (regions && regions.length) {
                    for (let i = regions.length; i--;) {
                        if (neverSelectable[regions[i].cid] === undefined) {
                            regions[i].selectable(selectable);
                        }

                        downrecursive(regions[i].regions());
                    }
                }
            }
        },

        treeBuild: function (arr) {
            const filterByCids = Boolean(this.topCidsFilter.length);
            const parentsCidsFilterHash = this.topCidsFilter.reduce(function (hash, cid) {
                hash[cid] = true;

                return hash;
            }, {});

            let cid;
            let region;
            let selected;
            let selectable;
            const hash = {};
            const selectedRegions = [];
            const result = ko.observableArray();

            const homeRegionsCids = this.pinHomeAllowed &&
                this.auth.iAm.regionHome.parents().concat(this.auth.iAm.regionHome.cid()) || false;
            let homeCountryCidFound = false;

            function openRegionParents(region) {
                const parentRegion = region.parent;

                if (parentRegion) {
                    parentRegion.opened(true);
                    openRegionParents(parentRegion);
                }
            }

            // Сортируем массив по уровням
            arr.sort(function (a, b) {
                return a.parents.length < b.parents.length ? -1 : a.parents.length > b.parents.length ? 1 : 0;
            });

            for (let i = 0, len = arr.length; i < len; i++) {
                region = arr[i];
                region.level = region.parents.length;


                if (region.level) {
                    region.parent = hash[region.parents[region.level - 1]];
                }

                // Due to some bug in tokenfield/typehead we have typehead list created only once and never removed,
                // so track region existence
                region.exists = false;
                cid = region.cid;
                this.regionsTypehead.push({
                    cid: cid,
                    value: region.title_en,
                    parentTitle: region.parent && region.parent.title_en,
                    tokens: [String(cid), region.title_local, region.title_en],
                });

                const proceed = !filterByCids || parentsCidsFilterHash[cid] === true ||
                    region.level > 0 && parentsCidsFilterHash[region.parents[region.level - 1]] === true;

                if (!proceed) {
                    continue;
                }

                region.exists = true;
                region.regions = ko.observableArray();

                selectable = this.neverSelectable[cid] === undefined;
                selected = this.selectedInitHash[cid] !== undefined;
                region.selectable = ko.observable(selectable);
                region.selected = ko.observable(selected);
                region.opened = ko.observable(selected);

                if (selected) {
                    openRegionParents(region);
                    selectedRegions.push(region);
                }

                if (region.level) {
                    if (region.parent) {
                        if (region.parent.home === true && homeRegionsCids.includes(cid)) {
                            region.home = true;
                            region.parent.regions.unshift(region);
                        } else {
                            region.parent.regions.push(region);
                        }
                    } else {
                        // Parent can be absent, if tree is not full (topCidsFilter)
                        result.push(region);
                    }
                } else if (homeRegionsCids && !homeCountryCidFound && homeRegionsCids.includes(cid)) {
                    region.home = homeCountryCidFound = true;
                    result.unshift(region);
                } else {
                    result.push(region);
                }

                region.collapseToggle = this.collapseToggle;
                region.clickNode = this.clickNode;

                hash[cid] = region;

                if (filterByCids) {
                    parentsCidsFilterHash[cid] = true;
                }
            }

            if (result().length === 1) {
                result()[0].opened(true);
            }

            //У изначально выбранных регионов делаем невыбираемыми другие регионы этой ветки
            selectedRegions.forEach(function (region) {
                this.toggleBranchSelectable(region, false);
            }, this);

            this.regionsHashByCid = hash;

            return result;
        },

        sortTree: function (tree) {
            const sortBy = this.sortBy();
            let sortOrder = this.sortOrder();
            const pinHome = this.pinHome();
            let field;

            switch (sortBy) {
                case 'sub':
                    field = 'childLen';
                    sortOrder = -sortOrder;
                    break;
                case 'photo':
                    field = 'phc';
                    sortOrder = -sortOrder;
                    break;
                case 'pic':
                    field = 'pac';
                    sortOrder = -sortOrder;
                    break;
                case 'comment':
                    field = 'cc';
                    sortOrder = -sortOrder;
                    break;
                case 'alphabet':
                default:
                    field = 'title_en';
            }

            return (function recursiveSort(arr) {
                const arrRaw = arr();

                if (arrRaw.length === 0) {
                    return arr;
                }

                arr.sort(function (a, b) {
                    if (pinHome) {
                        // Home region always goes first, no matter what sorting is on
                        if (a.home === true) {
                            return -1;
                        }

                        if (b.home === true) {
                            return 1;
                        }
                    }

                    const aval = a[field];
                    const bval = b[field];

                    if (!aval && bval) {
                        return 1;
                    }

                    if (!bval && aval) {
                        return -1;
                    }

                    if (aval === bval) {
                        // If values are equal (exists or not)
                        if (sortBy !== 'alphabet') {
                            // If it is not alphabetical order, order by title
                            return collator.compare(a.title_en, b.title_en);
                        }

                        // Otherwise don't sort
                        return 0;
                    }

                    if (sortBy === 'alphabet') {
                        return collator.compare(aval, bval);
                    }

                    return aval > bval ? sortOrder : -sortOrder;
                });

                arrRaw.forEach(function (region) {
                    recursiveSort(region.regions);
                });

                return arr;
            }(tree));
        },

        /**
         * Открывает/закрывает узел дерева. Возможно рекурсивное переключение
         *
         * @param {object} region Стартовый регион
         * @param {boolean} expandSelf Открыть/закрыть непосредственно переданный узел (true/false)
         * @param {boolean} cascadeExpand Открыть/закрыть рекурсивные узлы (true/false)
         * @param {string} cascadeDir Направление рекурсивного переключения ('up'/'down')
         */
        nodeToggle: function (region, expandSelf, cascadeExpand, cascadeDir) {
            let nextRegions;

            if (region && region.exists) {
                region.opened(typeof expandSelf === 'boolean' ? expandSelf : typeof cascadeExpand === 'boolean' ? cascadeExpand : !region.opened());
            } else if (cascadeDir) {
                region = { regions: this.regionsTree };
            }

            if (cascadeDir === 'up' && region.parent) {
                nextRegions = [region.parent];
            } else if (cascadeDir === 'down' && region.regions().length) {
                nextRegions = region.regions();
            }

            if (nextRegions) {
                for (let i = nextRegions.length; i--;) {
                    this.nodeToggle(nextRegions[i], undefined, cascadeExpand, cascadeDir);
                }
            }
        },

        collapseToggle: function (data/*, event*/) {
            data.opened(!data.opened());
        },
        expandAll: function (/*data, event*/) {
            this.nodeToggle(null, null, true, 'down');
        },
        collapseAll: function (/*data, event*/) {
            this.nodeToggle(null, null, false, 'down');
        },

        handlePinChange: function (val) {
            this.sortTree(this.regionsTree);

            Utils.setLocalStorage('regionSelect.pinHome', val);
        },

        handleSortChange: function () {
            this.sortTree(this.regionsTree);

            if (this.sortBy() === 'alphabet') {
                Utils.removeLocalStorage('regionSelect.sortBy');
            } else {
                Utils.setLocalStorage('regionSelect.sortBy', this.sortBy());
            }

            Utils.setLocalStorage('regionSelect.sortOrder', this.sortOrder());
        },
        sortByAlphabet: function () {
            this.sortBy('alphabet');
        },
        sortBySub: function () {
            this.sortBy('sub');
        },
        sortByPhoto: function () {
            this.sortBy('photo');
        },
        sortByPic: function () {
            this.sortBy('pic');
        },
        sortByComment: function () {
            this.sortBy('comment');
        },
    });
});

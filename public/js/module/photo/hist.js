/*global define:true*/
/**
 * Модель истории комментария
 */
define(
    ['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'm/photo/fields', 'lib/doT', 'text!tpl/photo/hist.jade', 'css!style/photo/hist'],
    function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, fields, doT, jade) {
        'use strict';
        var tplHist;
        var tplRegions;
        var tplRegionsDiff;
        var changeFragTexts = {
            f1: '<span class="glyphicon glyphicon-plus"></span> Добавлен фрагмент',
            f2: '<span class="glyphicon glyphicon-retweet"></span> Изменен фрагмент',
            f3: '<span class="glyphicon glyphicon-minus"></span> Удален фрагмент'
        };
        var maxRegionLevel = 5;
        var infoFields = ['s', 'nocomments'];
        var txtFields = ['title', 'geo', 'regions', 'y', 'desc', 'source', 'author', 'address'];

        return Cliche.extend({
            jade: jade,
            options: {
                cid: 0
            },
            create: function () {
                this.cid = this.options.cid;
                this.hist_id = {};
                this.showdiff = ko.observable(true);

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
                        this.data = data;
                        this.renderHist(data);
                        ko.applyBindings(globalVM, this.$dom[0]);
                    }
                    this.show();
                }, this);
            },
            show: function () {
                globalVM.func.showContainer(this.$container);
                if (this.modal) {
                    this.modal.$curtain.addClass('showModalCurtain');
                }
                this.showing = true;
            },
            hide: function () {
                globalVM.func.hideContainer(this.$container);
                this.showing = false;
            },
            switchDiff: function () {
                this.showdiff(!this.showdiff());
                this.renderHist(this.data);
            },
            renderHist: function (data) {
                var regionsHash = data.regions;
                var showDiff = this.showdiff();
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

                for (var i = 0; i < data.hists.length; i++) {
                    hist = data.hists[i];

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

                        for (j = 0; j < txtFields.length; j++) {
                            value = hist.values[txtFields[j]];
                            if (value) {
                                value.field = txtFields[j];
                                value.txt = value.txt || showDiff && value.vald || value.val;
                                hist.txtValues.push(value);
                            }
                        }
                    }

                    /*if (hist.frag) {
                     hist.frag = changeFragTexts['f' + hist.frag];
                     }*/

                }

                this.$dom[0].querySelector('.hist').innerHTML = tplHist({
                    hists: data.hists,
                    fields: fields,
                    infoFields: infoFields,
                    fDate: Utils.format.date.relative
                });
            },
            getHist: function (cb, ctx) {
                socket.once('takeObjHist', function (data) {
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

                socket.emit('giveObjHist', { cid: this.cid });
            }
        });
    });
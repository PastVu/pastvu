/**
 * Модель вставки FeatureCollection
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'model/storage', 'noties', 'text!tpl/admin/regionFeatureInsert.pug', 'css!style/admin/regionFeatureInsert'
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, storage, noties, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            cid: 0,
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

            this.cid = this.options.cid;
            this.response = ko.observable(null);

            this.show();
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
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        send: function () {
            var text = $('textarea#geoinput', this.$dom).val();

            try {
                var featureCollection = JSON.parse(text);

                if (featureCollection.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features) || !featureCollection.features.length) {
                    noties.error({ message: 'Doesn\'t look like FeatureCollection' });
                    return false;
                }
            } catch (error) {
                noties.error({ message: 'GeoJSON client parse error!<br>' + error.message });

                return false;
            }

            this.response(null);
            this.exe(true);

            socket.run('region.processFeatureCollection', { cid: this.cid, featureString: text })
                .then(function (data) {
                    if (data.features) {
                        data.features.forEach(function (feature) {
                            var stat = feature.stat;
                            var stats = [];

                            if (stat && Object.keys(stat).length) {
                                if (typeof stat.photosCountBefore === 'number' && typeof stat.photosCountAfter === 'number') {
                                    var geoChangePhotosCount = stat.photosCountAfter - stat.photosCountBefore;

                                    if (geoChangePhotosCount) {
                                        stats.push('<b>' + globalVM.intl.num(Math.abs(geoChangePhotosCount)) + '</b> фотографий ' + (geoChangePhotosCount > 0 ? 'добавлено в регион' : 'удалено из региона') + ' вследствии изменения коордиант поолигона.');
                                    }
                                }
                                if (typeof stat.commentsCountBefore === 'number' && typeof stat.commentsCountAfter === 'number') {
                                    var geoChangeCommentsCount = stat.commentsCountAfter - stat.commentsCountBefore;

                                    if (geoChangeCommentsCount) {
                                        stats.push('<b>' + globalVM.intl.num(Math.abs(geoChangeCommentsCount)) + '</b> комментариев ' + (geoChangeCommentsCount > 0 ? 'добавлено в регион' : 'удалено из региона') + ' вследствии переноса фотографий.');
                                    }
                                }
                                if (stat.affectedPhotos) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedPhotos) + '</b> фотографий переехали по дереву вслед за регионом.');
                                }
                                if (stat.affectedComments) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedComments) + '</b> комментариев переехали вслед за своими фотографиями.');
                                }
                                if (stat.affectedUsers) {
                                    stats.push('У <b>' + globalVM.intl.num(stat.affectedUsers) + '</b> пользователей были сокрашены "Мои регионы".');
                                }
                                if (stat.affectedMods) {
                                    stats.push('У <b>' + globalVM.intl.num(stat.affectedMods) + '</b> модераторов были сокрашены модерируемые регионы.');
                                }
                            }

                            feature.statString = stats.join('<br>');
                        });
                    }

                    this.exe(false);
                    this.response(data);
                }.bind(this))
                .catch(function (error) {
                    if (error.code === 'REGION_GEOJSON_PARSE') {
                        error.message += '<br/>' + _.get(error, 'details.why');
                    }
                    noties.error(error);
                    this.exe(false);
                }.bind(this));
        }
    });
});
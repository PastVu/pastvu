/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'i18n',
    'model/storage', 'noties', 'text!tpl/admin/regionFeatureInsert.pug', 'css!style/admin/regionFeatureInsert',
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, i18n, storage, noties, pug) {
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
            const text = $('textarea#geoinput', this.$dom).val();

            try {
                const featureCollection = JSON.parse(text);

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
                            const stat = feature.stat;
                            const stats = [];

                            if (stat && Object.keys(stat).length) {
                                if (typeof stat.photosCountBefore === 'number' && typeof stat.photosCountAfter === 'number') {
                                    const geoChangePhotosCount = stat.photosCountAfter - stat.photosCountBefore;

                                    if (geoChangePhotosCount) {
                                        stats.push(i18n(geoChangePhotosCount > 0 ?
                                            '<b>{{count}}</b> фотографий добавлено в регион вследствии изменения коордиант поолигона.' :
                                            '<b>{{count}}</b> фотографий удалено из региона вследствии изменения коордиант поолигона.', { count: globalVM.intl.num(Math.abs(geoChangePhotosCount)) }));
                                    }
                                }

                                if (typeof stat.commentsCountBefore === 'number' && typeof stat.commentsCountAfter === 'number') {
                                    const geoChangeCommentsCount = stat.commentsCountAfter - stat.commentsCountBefore;

                                    if (geoChangeCommentsCount) {
                                        stats.push(i18n(geoChangeCommentsCount > 0 ?
                                            '<b>{{count}}</b> комментариев добавлено в регион вследствии переноса фотографий.' :
                                            '<b>{{count}}</b> комментариев удалено из региона вследствии переноса фотографий.', { count: globalVM.intl.num(Math.abs(geoChangeCommentsCount)) }));
                                    }
                                }

                                if (stat.affectedPhotos) {
                                    stats.push(i18n('<b>{{count}}</b> фотографий переехали по дереву вслед за регионом.', { count: globalVM.intl.num(stat.affectedPhotos) }));
                                }

                                if (stat.affectedComments) {
                                    stats.push(i18n('<b>{{count}}</b> комментариев переехали вслед за своими фотографиями.', { count: globalVM.intl.num(stat.affectedComments) }));
                                }

                                if (stat.affectedUsers) {
                                    stats.push(i18n('У <b>{{count}}</b> пользователей были сокрашены "Мои регионы".', { count: globalVM.intl.num(stat.affectedUsers) }));
                                }

                                if (stat.affectedMods) {
                                    stats.push(i18n('У <b>{{count}}</b> модераторов были сокрашены модерируемые регионы.', { count: globalVM.intl.num(stat.affectedMods) }));
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
        },
    });
});

/**
 * Модель вставки FeatureCollection
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'model/storage', 'noties', 'text!tpl/admin/regionFeatureInsert.jade', 'css!style/admin/regionFeatureInsert'
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, storage, noties, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
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
                                        stats.push('<b>' + globalVM.intl.num(Math.abs(geoChangePhotosCount)) + '</b> photos are ' + (geoChangePhotosCount > 0 ? 'added to the region' : 'removed from the region') + ' because of polygon coordinates changing.');
                                    }
                                }
                                if (typeof stat.commentsCountBefore === 'number' && typeof stat.commentsCountAfter === 'number') {
                                    var geoChangeCommentsCount = stat.commentsCountAfter - stat.commentsCountBefore;

                                    if (geoChangeCommentsCount) {
                                        stats.push('<b>' + globalVM.intl.num(Math.abs(geoChangeCommentsCount)) + '</b> comments are ' + (geoChangeCommentsCount > 0 ? 'added to the region' : 'removed from the region') + ' because of photos transfer.');
                                    }
                                }
                                if (stat.affectedPhotos) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedPhotos) + '</b> photos have been moved following the region.');
                                }
                                if (stat.affectedComments) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedComments) + '</b> comments have been moved following their photos.');
                                }
                                if (stat.affectedUsers) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedUsers) + '</b> users have been reduced in "my regions" count.');
                                }
                                if (stat.affectedMods) {
                                    stats.push('<b>' + globalVM.intl.num(stat.affectedMods) + '</b> moderators have been reduced moderators regions.');
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
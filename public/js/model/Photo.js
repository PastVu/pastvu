/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'model/User', 'model/Region', 'm/photo/status', 'Params'],
    function ($, _, ko, koMapping, Utils, User, Region, statuses, P) {
        'use strict';

        const defaults = {
            // Следующие типы включают друг друга по нарастающей
            base: {
                cid: '',
                s: statuses.keys.PUBLIC,

                type: statuses.type.PHOTO,

                file: '',
                title: '',

                conv: false, // Converting now
                convqueue: false, // In queue for convertion
            },
            compact: {
                ldate: Date.now(), // Load time

                y: '',
                year: null,
                year2: null,

                ccount: 0,
            },
            full: {
                user: {},
                album: 0,
                stack: '',
                stack_order: 0,

                geo: null,
                regions: [],
                cdate: null, // Время изменения
                vdate: null, // Время последнего просмотра
                stdate: null, // Время установки текущего статуса фотографии
                changed: false,

                dir: undefined,

                mime: 'image/jpeg',
                format: 'JPEG',
                size: 0,
                w: 1050,
                h: 700,
                ws: 1050,
                hs: 700,
                waterhs: 0,

                watersignIndividual: false,
                watersignOption: undefined,
                watersignCustom: null,
                watersignText: null,
                watersignTextApplied: null,

                disallowDownloadOriginIndividual: false,
                disallowDownloadOrigin: false,

                nowaterchange: false,

                desc: '',
                address: '',
                source: '',
                author: '',

                frags: [],

                vdcount: 0,
                vwcount: 0,
                vcount: 0,

                ccount_new: 0,
                subscr: false,
                nocomments: false,
            },
        };
        const canDef = {
            edit: false,
            ready: false,
            revision: false,
            revoke: false,
            reject: false,
            rereject: false,
            approve: false,
            activate: false,
            deactivate: false,
            remove: false,
            restore: false,
            convert: false,
            comment: false,
            watersign: false,
            nowaterchange: false,
            download: 'login',
            'protected': undefined,
        };
        const picPrefix = '/_p';
        const picProtectedPrefix = '/_pr';
        const picCoveredPrefix = '/_prn';
        const sizeVariants = ['a', 'd', 'h', 'm', 'q', 's', 'x'];

        const picFormats = createFormatMap(P.settings.cdn.url || picPrefix);
        const picCoveredFormats = createFormatMap(picCoveredPrefix);
        const picProtectedFormats = createFormatMap(picProtectedPrefix);

        function createFormatMap(prefix) {
            return sizeVariants.reduce(function (result, size) {
                result[size] = prefix + '/' + size + '/';

                return result;
            }, {});
        }
        _.assign(defaults.compact, defaults.base);
        _.assign(defaults.full, defaults.compact);

        /**
         * Фабрика. Из входящих данных создает полноценный объект, в котором недостающие поля заполнены дефолтными значениями
         *
         * @param {object} origin Входящий объект
         * @param {object} options
         * @param {string} options.type Название дефолтного объекта для сляния
         * @param {string} options.pic Тим картинки
         * @param {object} options.customDefaults Собственные свойства, заменяющие аналогичные в дефолтном объекте
         * @returns {object}
         */
        function factory(origin, options) {
            if (origin === undefined) {
                origin = {};
            }

            if (options === undefined) {
                options = {};
            }

            const type = options.type || 'full';
            const pic = options.pic || 'd';
            const userType = options.userType || 'middle';
            const can = options.can || {};

            if (options.customDefaults) {
                origin = _.defaults(origin, options.customDefaults, defaults[type]);
            } else {
                origin = _.defaults(origin, defaults[type]);
            }

            if (origin.ldate) {
                origin.ldate = new Date(origin.ldate);
            }

            if (type === 'full') {
                if (!Utils.geo.checkLatLng(origin.geo)) {
                    origin.geo = defaults[type].geo;
                }

                if (origin.regions.length) {
                    Region.factory(_.last(origin.regions), 'home');
                }

                if (origin.cdate) {
                    origin.cdate = new Date(origin.cdate);
                }

                if (origin.vdate) {
                    origin.vdate = new Date(origin.vdate);
                }

                if (origin.stdate) {
                    origin.stdate = new Date(origin.stdate);
                }

                User.factory(origin.user, userType);
            }

            origin.status = statuses.nums[origin.s] || {};

            if (can.protected === true) {
                origin.sfile = picProtectedFormats[pic] + origin.file;
                origin.fileroot = picProtectedPrefix;
            } else if (can.protected === false) {
                origin.sfile = picCoveredFormats[pic] + origin.file;
                origin.fileroot = picCoveredPrefix;
            } else {
                origin.sfile = picFormats[pic] + origin.file;
                origin.fileroot = picPrefix;
            }

            return origin;
        }

        function vmCreate(data) {
            const vm = koMapping.fromJS(data);

            return vm;
        }

        /**
         * Создает из объекта ViewModel
         * Если указана текущая ViewModel, то обновляет её новыми данными
         *
         * @param {object} data Данные
         * @param {object} vmExist Существующая ViewModel
         * @param {boolean} withoutFactory Флаг, указывающий что не надо применять к данным фабрику
         * @returns {object}
         */
        function vm(data, vmExist, withoutFactory, can) {
            if (!withoutFactory) {
                factory(data, { can: can });
            }

            if (!vmExist) {
                vmExist = vmCreate(data);
            } else {
                koMapping.fromJS(data, vmExist);

                // Hack, somehow koMapping stopped replace some fields
                if (data.desc !== undefined) {
                    vmExist.desc(data.desc);
                }

                if (data.author !== undefined) {
                    vmExist.author(data.author);
                }

                if (data.source !== undefined) {
                    vmExist.source(data.source);
                }
            }

            return vmExist;
        }

        return {
            factory: factory,
            vm: vm,
            def: defaults,
            canDef: canDef,
            picFormats: picFormats,
            picCoveredFormats: picCoveredFormats,
            picProtectedFormats: picProtectedFormats,
        };
    }
);

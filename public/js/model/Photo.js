define(
    ['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'Params', 'model/User', 'model/Region', 'm/photo/status'],
    function ($, _, ko, koMapping, Utils, P, User, Region, statuses) {

        var defaults = {
            // Следующие типы включают друг друга по нарастающей
            base: {
                cid: '',
                s: statuses.keys.PUBLIC,

                file: '',
                title: '',

                conv: false, // Converting now
                convqueue: false // In queue for convertion
            },
            compact: {
                ldate: Date.now(), // Load time

                y: '',
                year: null,
                year2: null,

                ccount: 0
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

                type: 'image/jpeg',
                format: 'JPEG',
                size: 0,
                w: 1050,
                h: 700,
                ws: 1050,
                hs: 700,
                signs: 'blank',
                waterhs: 0,

                watersignIndividual: false,
                watersignOption: undefined,
                watersignCustom: null,
                watersignText: null,
                watersignTextApplied: null,

                disallowDownloadOrigin: false,

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
                nocomments: false
            }
        };
        var canDef = {
            edit: false,
            disable: false,
            remove: false,
            approve: false,
            convert: false
        };
        var picPrefix = '/_p';
        var picFormats = {
            a: picPrefix + '/a/',
            d: picPrefix + '/d/',
            h: picPrefix + '/h/',
            m: picPrefix + '/m/',
            q: picPrefix + '/q/',
            s: picPrefix + '/s/',
            x: picPrefix + '/x/'
        };

        _.assign(defaults.compact, defaults.base);
        _.assign(defaults.full, defaults.compact);

        /**
         * Фабрика. Из входящих данных создает полноценный объект, в котором недостающие поля заполнены дефолтными значениями
         * @param origin Входящий объект
         * @param defType Название дефолтного объекта для сляния
         * @param picType Тим картинки
         * @param customDefaults Собственные свойства, заменяющие аналогичные в дефолтном объекте
         * @return {*}
         */
        function factory(origin, defType, picType, customDefaults, userDefType) {
            origin = origin || {};
            defType = defType || 'full';
            picType = picType || 'd';
            userDefType = userDefType || 'middle';

            if (customDefaults) {
                origin = _.defaults(origin, customDefaults, defaults[defType]);
            } else {
                origin = _.defaults(origin, defaults[defType]);
            }

            if (origin.ldate) {
                origin.ldate = new Date(origin.ldate);
            }

            if (defType === 'full') {
                if (!Utils.geo.checkLatLng(origin.geo)) {
                    origin.geo = defaults[defType].geo;
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
                User.factory(origin.user, userDefType);
            }

            origin.status = statuses.nums[origin.s] || {};
            origin.sfile = P.preaddr + picFormats[picType] + origin.file;

            return origin;
        }

        function vmCreate(data) {
            var vm = koMapping.fromJS(data);

            User.vmAdditional(vm.user);
            return vm;
        }

        /**
         * Создает из объекта ViewModel
         * Если указана текущая ViewModel, то обновляет её новыми данными
         * @param data Данные
         * @param vmExist Существующая ViewModel
         * @param withoutFactory Флаг, указывающий что не надо применять к данным фабрику
         * @return {*}
         */
        function vm(data, vmExist, withoutFactory) {
            if (!withoutFactory) {
                factory(data, 'full', 'd');
            }
            if (!vmExist) {
                vmExist = vmCreate(data);
            } else {
                koMapping.fromJS(data, vmExist);
            }
            return vmExist;
        }

        return { factory: factory, vm: vm, def: defaults, canDef: canDef, picFormats: picFormats };
    }
);
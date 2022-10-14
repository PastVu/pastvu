/*global define:true*/
define(['jquery', 'underscore', 'Utils', 'knockout', 'knockout.mapping', 'Params'], function ($, _, Utils, ko, ko_mapping, P) {
    'use strict';

    const defaults = {
        base: {
            cid: 0,
            title_en: '',
            title_local: '',
        },
        home: {
            parents: [],
            center: null,
            bbox: null,
            bboxhome: null,
        },
    };

    _.assign(defaults.home, defaults.base);

    /**
     * Фабрика. Из входящих данных создает полноценный объект, в котором недостающие поля заполнены дефолтными значениями
     *
     * @param origin входящий объект
     * @param defType название дефолтного объекта для сляния
     * @param customDefaults собственные свойства, заменяющие аналогичные в дефолтном объекте
     * @returns {*}
     */
    function factory(origin, defType, customDefaults) {
        origin = origin || {};
        defType = defType || 'full';

        if (defType === 'home' && !Utils.geo.checkbbox(origin.bboxhome)) {
            delete origin.bboxhome;
        }

        origin = _.defaults(origin, customDefaults ? _.assign(defaults[defType], customDefaults) : defaults[defType]);

        return origin;
    }

    function vmCreate(data) {
        const vm = ko_mapping.fromJS(data);

        return vm;
    }

    /**
     * Создает из объекта viewmodel
     * если указана текущая viewmodel, то обновляет её новыми данными
     *
     * @param data данные
     * @param vmExist существующая viewmodel
     * @param withoutFactory флаг, указывающий что не надо применять к данным фабрику
     * @returns {*}
     */
    function vm(data, vmExist, withoutFactory) {
        if (!withoutFactory) {
            data = factory(data, 'home');
        }

        if (!vmExist) {
            vmExist = vmCreate(data);
        } else {
            ko_mapping.fromJS(data, vmExist);
        }

        return vmExist;
    }

    return { factory: factory, vm: vm, def: defaults };
});

define(['jquery', 'underscore', 'Utils', 'knockout', 'knockout.mapping', 'Params', 'model/Region'], function ($, _, Utils, ko, ko_mapping, P, Region) {
    var defaults = {
        base: {
            login: 'anonymous',

            avatar: '/img/caps/avatar.png',
            avatarth: '/img/caps/avatarth.png',
            disp: '',

            ranks: [],

            online: false
        },
        middle: {
            settings: {},
            watersignCustom: '',
            nowaterchange: false
        },
        full: {
            email: '',
            firstName: '',
            lastName: '',

            role: 0,

            regionHome: null, // Populated home region
            regions: [], // Populated regions for filtration by default
            mod_regions: [], // Populated regions of moderator

            // profile
            birthdate: '',
            sex: 'm',
            country: '',
            city: '',
            work: '',
            www: '',
            icq: '',
            skype: '',
            aim: '',
            lj: '',
            flickr: '',
            blogger: '',
            aboutme: '',

            regdate: Date.now(),
            pfcount: 0,
            pcount: 0,
            bcount: 0,
            ccount: 0,
            dateFormat: 'dd.mm.yyyy',

            _v_: 0
        }
    };

    _.assign(defaults.middle, defaults.base);
    _.assign(defaults.full, defaults.middle);

    /**
     * Фабрика. Из входящих данных создает полноценный объект, в котором недостающие поля заполнены дефолтными значениями
     * @param origin входящий объект
     * @param defType название дефолтного объекта для сляния
     * @param customDefaults собственные свойства, заменяющие аналогичные в дефолтном объекте
     * @return {*}
     */
    function factory(origin, defType, customDefaults) {
        origin = origin || {};
        defType = defType || 'full';

        if (origin.avatar) {
            // Сохраняем исходное значение поля avatar в ava, чтобы при повторном factory не добавить префиксы еще раз
            origin.ava = origin.ava || origin.avatar;

            origin.avatarth = P.preaddr + '/_a/h/' + origin.ava;
            origin.avatar = P.preaddr + '/_a/d/' + origin.ava;
        }
        if (!origin.disp) {
            origin.disp = origin.login;
        }

        if (defType === 'full') {
            origin.regionHome = Region.factory(origin.regionHome, 'home'); //Надо имено присваивать на случай, если origin.regionHome - undefined, у анонимов
        }

        origin = _.defaults(origin, customDefaults ? _.assign(defaults[defType], customDefaults) : defaults[defType]);

        if (defType === 'full') {
            origin.regdate = new Date(origin.regdate);
        }

        return origin;
    }

    function vmCreate(data) {
        delete data.fullname; // удаляем, так как во viewmodel это будет computed

        var vm = ko_mapping.fromJS(data);
        vmAdditional(vm);
        return vm;
    }

    /**
     * Расширение для модели
     * @param vm ViewModel
     */
    function vmAdditional(/*vm*/) {
    }

    /**
     * Создает из объекта viewmodel
     * если указана текущая viewmodel, то обновляет её новыми данными
     * @param data данные
     * @param vmExist существующая viewmodel
     * @param withoutFactory флаг, указывающий что не надо применять к данным фабрику
     * @return {*}
     */
    function vm(data, vmExist, withoutFactory) {
        if (!withoutFactory) {
            data = factory(data, 'full');
        }
        if (!vmExist) {
            vmExist = vmCreate(data);
        } else {
            ko_mapping.fromJS(data, vmExist);
        }
        return vmExist;
    }

    return { factory: factory, vm: vm, vmAdditional: vmAdditional, def: defaults };
});
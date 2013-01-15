/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'm/User'], function ($, _, ko, ko_mapping, Utils, User) {
    'use strict';

    var defaults = {
            micro: {
                cid: 0,

                file: '',
                title: '',

                conv: false, //Конвертируется
                convqueue: false, //В очереди на конвертацию
                fresh: false, //Новое
                disabled: false, //Не активное
                del: false //К удалению
            },
            compact: {
                loaded: Date.now(),

                year: 1900,
                year2: 1900,

                ccount: 0
            },
            standard: {
                user: User.defCompact,
                album: 0,
                stack: '',
                stack_order: 0,

                geo: [0, 0],
                dir: undefined,

                type: 'image/jpeg',
                format: 'JPEG',
                size: 0,
                w: 600,
                h: 600,

                desc: '',
                address: '',
                source: '',
                author: '',

                stats_day: 0,
                stats_week: 0,
                stats_all: 0
            }
        },
        picPrefix = '/_photo',
        picFormats = {
            micro: picPrefix + '/micro/',
            mini: picPrefix + '/mini/',
            thumb: picPrefix + '/thumb/',
            standard: picPrefix + '/standard/',
            origin: picPrefix + '/origin/'
        };

    _.assign(defaults.compact, defaults.micro);
    _.assign(defaults.standard, defaults.compact);

    function factory(origin, defType, picFormat) {
        origin = origin || {};
        defType = defType || 'standard';
        picFormat = picFormat || 'standard';

        origin = _.defaults(origin, defaults[defType]);

        if (defType === 'compact' || defType === 'standard') {
            origin.loaded = new Date(origin.loaded);
        }
        if (defType === 'standard') {
            origin.geo[0] = origin.geo[0] || defaults[defType].geo[0];
            origin.geo[1] = origin.geo[1] || defaults[defType].geo[1];
            _.defaults(origin.user, User.defCompact);
        }
        origin.sfile = picFormats[picFormat] + origin.file;

        return origin;
    }

    function vmCreate(model) {
        model = factory(model, 'standard', 'standard');

        var vm = ko_mapping.fromJS(model);

        vm.user.fullName = ko.computed(function () {
            if (this.firstName() && this.lastName()) {
                return this.firstName() + " " + this.lastName();
            } else {
                return this.login();
            }
        }, vm.user);

        return vm;
    }

    function vm(model, vmExist) {
        if (!vmExist) {
            vmExist = vmCreate(model);
        } else {
            model = factory(model, 'standard', 'standard');
            ko_mapping.fromJS(model, vmExist);
        }
        return vmExist;
    }

    return {factory: factory, vm: vm, def: defaults};
})
;
/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils'], function ($, _, ko, ko_mapping, Utils) {
    'use strict';

    var Default = {
            cid: 0,
            user: {
                login: 'anonimous',
                avatar: '/img/caps/avatar.png',
                avatarW: 100,
                avatarH: 100
            },
            album: 0,
            stack: '',
            stack_order: 0,

            lat: '0',
            lng: '0',
            dir: undefined,

            file: '',
            loaded: Date.now(),
            type: 'image/jpeg',
            format: 'JPEG',
            size: 0,
            w: 600,
            h: 600,

            title: '',
            year: 1900,
            year2: 1900,
            desc: '',
            address: '',
            source: '',
            author: '',

            stats_day: 0,
            stats_week: 0,
            stats_all: 0,
            ccount: 0,

            conv: false, //Конвертируется
            convqueue: false, //В очереди на конвертацию
            fresh: false, //Новое
            disabled: false, //Не активное
            del: false //К удалению
        },
        DefaultCompact = {
            cid: 0,
            title: 'No tytle yet',
            file: '',
            year: 1900,
            year2: 1900,
            ccount: 0,
            conv: false, //Конвертируется
            convqueue: false, //В очереди на конвертацию
            fresh: false, //Новое
            disabled: false, //Не активное
            del: false //К удалению
        };

    function vmCreate(model) {
        model = _.defaults(model || {}, Default);
        var vm = ko_mapping.fromJS(model);

        vm.sfile = ko.computed(function () {
            return '/_photo/standard/' + this.file();
        }, vm);

        return vm;
    }

    function vm(model, vmExist) {
        if (!vmExist) {
            vmExist = vmCreate(model);
        } else {
            model = _.defaults(model || {}, Default);
            ko_mapping.fromJS(model, vmExist);
        }
        vmExist.loaded(new Date(vmExist.loaded()));
        return vmExist;
    }

    return {def: Default, defCompact: DefaultCompact, VM: vm};
});
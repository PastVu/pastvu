/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils'], function ($, _, ko, ko_mapping, Utils) {
    'use strict';

    var Default = {
        cid: 0,
        user: {
            avatar: '/img/caps/avatar.png',
            avatarW: 100,
            avatarH: 100
        },
        album: 0,
        stack: '',
        stack_order: 0,

        lat: '0',
        lng: '0',
        dir: '',

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
        desc: 'Строительная площадка моста метро располагалась на левом берегу в пределах Центрального стадиона. Она состояла из территории , занимаемой эстакадой, небольшой части набережной, на которой производили монтаж речного пролётного строения и некоторых вспомогательных временных зданий. Строительство моста было начато с сооружения левобережной эстакады. Монтаж её конструктивных элементов осуществлялся портальными кранами, которых было по два на каждом берегу ( портальные краны левого берега видны на снимке).',
        address: '',
        source: '',
        author: '',

        stats_day: 0,
        stats_week: 0,
        stats_all: 0,
        ccount: 0,

        fresh: false, //Новое
        active: true,  //Активное
        conv: false, //Конвертируется
        convqueue: false, //В очереди на конвертацию
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

    return {def: Default, VM: vm};
});
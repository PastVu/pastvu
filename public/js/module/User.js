/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils'], function ($, _, ko, ko_mapping, Utils) {
    var DefaultUser = {
        login: 'anonymous',
        email: '',

        //ROLE
        role_level: 0,
        role_name: 'anonymous',

        //Profile
        avatar: '/img/caps/avatar.png',
        firstName: '',
        lastName: '',
        birthdate: '',
        sex: 'male',
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

        regdate: new Date(0),
        pcount: 0,
        bcount: 0,
        ccount: 0,
        dateFormat: 'dd.mm.yyyy'
    };

    function userVMCreate(model) {
        model = _.defaults(model || {}, DefaultUser);
        var vm = ko_mapping.fromJS(model);

        vm.fullName = ko.computed(function () {
            if (this.firstName() && this.lastName()) {
                return this.firstName() + " " + this.lastName();
            } else {
                return this.login();
            }
        }, vm);

        return vm;
    }

    function UserVM(model, vm) {
        if (!vm) {
            vm = userVMCreate(model);
        } else {
            model = model || {};
            ko_mapping.fromJS(model, vm);
        }
        vm.regdate(new Date(vm.regdate()));
        return vm;
    }

    return {def: DefaultUser, VM: UserVM};
});
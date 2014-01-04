/*global define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'Params', 'model/User'], function ($, _, ko, ko_mapping, Utils, P, User) {
	'use strict';

	var defaults = {
			// Следующие типы включают друг друга по нарастающей
			base: {
				cid: '',
				s: 5,

				file: '',
				title: '',

				conv: false, //Конвертируется
				convqueue: false //В очереди на конвертацию
			},
			compact: {
				ldate: Date.now(),
				adate: Date.now(),
				sdate: Date.now(),

				year: 2000,
				year2: 2000,

				ccount: 0
			},
			full: {
				user: {},
				album: 0,
				stack: '',
				stack_order: 0,

				geo: null,
				regions: [],
				dir: undefined,

				type: 'image/jpeg',
				format: 'JPEG',
				size: 0,
				w: 1050,
				h: 700,
				ws: 1050,
				hs: 700,

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
		},
		canDef = {
			edit: false,
			disable: false,
			remove: false,
			approve: false,
			convert: false
		},
		picPrefix = '/_p',
		picFormats = {
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
	function factory(origin, defType, picType, customDefaults) {
		origin = origin || {};
		defType = defType || 'full';
		picType = picType || 'd';

		if (customDefaults) {
			origin = _.defaults(origin, customDefaults, defaults[defType]);
		} else {
			origin = _.defaults(origin, defaults[defType]);
		}

		if (defType === 'compact' || defType === 'full') {
			origin.ldate = new Date(origin.ldate);
			origin.adate = new Date(origin.adate);
			origin.sdate = new Date(origin.sdate);
		}
		if (defType === 'full') {
			if (!Utils.geo.checkLatLng(origin.geo)) {
				origin.geo = defaults[defType].geo;
			}
			User.factory(origin.user, 'base');
		}

		origin.sfile = P.preaddr + picFormats[picType] + origin.file;

		return origin;
	}

	function vmCreate(data) {
		var vm = ko_mapping.fromJS(data);

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
			ko_mapping.fromJS(data, vmExist);
		}
		return vmExist;
	}

	return {factory: factory, vm: vm, def: defaults, canDef: canDef, picFormats: picFormats};
});
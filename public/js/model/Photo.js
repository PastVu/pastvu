/*global define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'model/User'], function ($, _, ko, ko_mapping, Utils, User) {
	'use strict';

	var defaults = {
			// Следующие типы включают друг друга по нарастающей
			base: {
				cid: '',

				file: '',
				title: '',

				conv: false, //Конвертируется
				convqueue: false, //В очереди на конвертацию
				fresh: false, //Новое
				disabled: false, //Не активное
				del: false //К удалению
			},
			compact: {
				ldate: Date.now(),
				adate: Date.now(),

				year: 2000,
				year2: 2000,

				ccount: 0
			},
			full: {
				user: {},
				album: 0,
				stack: '',
				stack_order: 0,

				geo: [0, 0],
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
				vcount: 0
			}
		},
		picPrefix = '/_p',
		picFormats = {
			micros: picPrefix + '/micros/',
			microm: picPrefix + '/micro/',
			micro: picPrefix + '/micro/',
			mini: picPrefix + '/mini/',
			midi: picPrefix + '/midi/',
			thumb: picPrefix + '/thumb/',
			standard: picPrefix + '/standard/',
			origin: picPrefix + '/origin/'
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
		picType = picType || 'standard';

		if (customDefaults) {
			origin = _.defaults(origin, customDefaults, defaults[defType]);
		} else {
			origin = _.defaults(origin, defaults[defType]);
		}

		if (defType === 'compact' || defType === 'full') {
			origin.ldate = new Date(origin.ldate);
			origin.adate = new Date(origin.adate);
		}
		if (defType === 'full') {
			origin.geo[0] = origin.geo[0] || defaults[defType].geo[0];
			origin.geo[1] = origin.geo[1] || defaults[defType].geo[1];
			origin.geo.reverse(); // Stores in mongo like [lng, lat], for leaflet need [lat, lng]
			User.factory(origin.user, 'base');
		}
		origin.sfile = picFormats[picType] + origin.file;

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
			factory(data, 'full', 'standard');
		}
		if (!vmExist) {
			vmExist = vmCreate(data);
		} else {
			ko_mapping.fromJS(data, vmExist);
		}
		return vmExist;
	}

	return {factory: factory, vm: vm, def: defaults, picFormats: picFormats};
});
/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'm/User'], function ($, _, ko, ko_mapping, Utils, User) {
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
				loaded: Date.now(),

				year: 1900,
				year2: 1900,

				ccount: 0,
				fcount: 0
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
				w: 600,
				h: 600,

				desc: '',
				address: '',
				source: '',
				author: '',

				stats_day: 0,
				stats_week: 0,
				stats_all: 0
			},
			// Тип для точки на карте, заполняется из full ниже
			mapdot: {dir: ''},
			// Тип для кластера на карте
			mapclust: {c: 0, measure: ''}
		},
		picPrefix = '/_photo',
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

	// Заполняем полями тип точки и кластера на карте
	_.assign(defaults.mapdot, _.pick(defaults.full, 'cid', 'geo', 'file', 'title', 'year'));
	_.assign(defaults.mapclust, _.pick(defaults.full, 'geo', 'file'));


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

		if (defType !== 'mapclust') {
			origin.cid = String(origin.cid);
		}

		origin = _.defaults(origin, customDefaults ? _.assign(defaults[defType], customDefaults) : defaults[defType]);

		if (defType === 'compact' || defType === 'full') {
			origin.loaded = new Date(origin.loaded);
		}
		if (defType === 'full') {
			origin.geo[0] = origin.geo[0] || defaults[defType].geo[0];
			origin.geo[1] = origin.geo[1] || defaults[defType].geo[1];
			origin.geo.reverse(); // Stores in mongo like [lng, lat], for leaflet need [lat, lng]
			User.factory(origin.user, 'base');
		}
		if (defType === 'mapclust') {
			if (picType === 'local') {
				if (origin.c < 10) {
					origin.measure = 's';
				} else if (origin.c < 50) {
					origin.measure = 'm';
				}
			} else {
				origin.cid = origin.geo[0] + '@' + origin.geo[1];
				if (origin.c < 500) {
					origin.measure = 's';
				} else if (origin.c < 3000) {
					origin.measure = 'm';
				}
			}
			picType = 'micro' + origin.measure;
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

	return {factory: factory, vm: vm, def: defaults};
});
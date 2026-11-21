/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import 'jquery';
import _ from 'underscore';
import Utils from 'Utils';
import 'knockout';
import ko_mapping from 'knockout.mapping';

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
 * @param {object} origin входящий объект
 * @param {string} defType название дефолтного объекта для сляния
 * @param {object} customDefaults собственные свойства, заменяющие аналогичные в дефолтном объекте
 * @returns {object}
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
 * @param {object} data данные
 * @param {object} vmExist существующая viewmodel
 * @param {boolean} withoutFactory флаг, указывающий что не надо применять к данным фабрику
 * @returns {object}
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

export default { factory: factory, vm: vm, def: defaults };

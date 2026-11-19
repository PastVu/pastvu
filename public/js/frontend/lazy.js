/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import i18n from 'i18n';
import noties from 'noties';

const modules = {
    'm/_moduleCliche': () => import('m/_moduleCliche'),
    'm/admin/conveyer': () => import('m/admin/conveyer'),
    'm/admin/main': () => import('m/admin/main'),
    'm/admin/menu': () => import('m/admin/menu'),
    'm/admin/newsEdit': () => import('m/admin/newsEdit'),
    'm/admin/region': () => import('m/admin/region'),
    'm/admin/regionCheck': () => import('m/admin/regionCheck'),
    'm/admin/regionFeatureInsert': () => import('m/admin/regionFeatureInsert'),
    'm/admin/regionList': () => import('m/admin/regionList'),
    'm/admin/submenu': () => import('m/admin/submenu'),
    'm/comment/comments': () => import('m/comment/comments'),
    'm/comment/hist': () => import('m/comment/hist'),
    'm/common/auth': () => import('m/common/auth'),
    'm/common/foot': () => import('m/common/foot'),
    'm/common/reason': () => import('m/common/reason'),
    'm/common/share': () => import('m/common/share'),
    'm/common/top': () => import('m/common/top'),
    'm/diff/about': () => import('m/diff/about'),
    'm/diff/news': () => import('m/diff/news'),
    'm/diff/newsList': () => import('m/diff/newsList'),
    'm/main/bottomPanel': () => import('m/main/bottomPanel'),
    'm/main/commentsFeed': () => import('m/main/commentsFeed'),
    'm/main/mainPage': () => import('m/main/mainPage'),
    'm/map/map': () => import('m/map/map'),
    'm/map/mapClusterCalc': () => import('m/map/mapClusterCalc'),
    'm/map/marker': () => import('m/map/marker'),
    'm/map/navSlider': () => import('m/map/navSlider'),
    'm/photo/fields': () => import('m/photo/fields'),
    'm/photo/gallery': () => import('m/photo/gallery'),
    'm/photo/hist': () => import('m/photo/hist'),
    'm/photo/photo': () => import('m/photo/photo'),
    'm/photo/status': () => import('m/photo/status'),
    'm/region/select': () => import('m/region/select'),
    'm/user/brief': () => import('m/user/brief'),
    'm/user/comments': () => import('m/user/comments'),
    'm/user/manage': () => import('m/user/manage'),
    'm/user/photoUpload': () => import('m/user/photoUpload'),
    'm/user/profile': () => import('m/user/profile'),
    'm/user/session': () => import('m/user/session'),
    'm/user/sessions': () => import('m/user/sessions'),
    'm/user/settings': () => import('m/user/settings'),
    'm/user/subscr': () => import('m/user/subscr'),
    'm/user/userPage': () => import('m/user/userPage'),
    'leaflet-extends/L.Google': () => import('leaflet-extends/L.Google'),
    'leaflet-extends/L.Yandex': () => import('leaflet-extends/L.Yandex'),
    'jfileupload/jquery.iframe-transport': () => import('jfileupload/jquery.iframe-transport'),
    'jfileupload/jquery.fileupload': () => import('jfileupload/jquery.fileupload'),
    'bs/ext/datepicker/datepicker': () => import('bs/ext/datepicker/datepicker'),
    'bs/ext/datepicker/lang/ru': () => import('bs/ext/datepicker/lang/ru'),
    'style/bsext/datepicker.css': () => import('style/bsext/datepicker.css'),
    'tpl/comment/cdotdelopen.pug?raw': () => import('tpl/comment/cdotdelopen.pug?raw'),
    'trumbowyg-plugins/cleanpaste/trumbowyg.cleanpaste.min': () => import('trumbowyg-plugins/cleanpaste/trumbowyg.cleanpaste.min'),
    'trumbowyg-plugins/colors/trumbowyg.colors.min': () => import('trumbowyg-plugins/colors/trumbowyg.colors.min'),
    'trumbowyg-plugins/fontsize/trumbowyg.fontsize.min': () => import('trumbowyg-plugins/fontsize/trumbowyg.fontsize.min'),
    'trumbowyg-plugins/history/trumbowyg.history.min': () => import('trumbowyg-plugins/history/trumbowyg.history.min'),
    'trumbowyg-plugins/indent/trumbowyg.indent.min': () => import('trumbowyg-plugins/indent/trumbowyg.indent.min'),
    'trumbowyg-plugins/noembed/trumbowyg.noembed.min': () => import('trumbowyg-plugins/noembed/trumbowyg.noembed.min'),
    'jquery-plugins/jquery-resizable.min': () => import('jquery-plugins/jquery-resizable.min'),
    'trumbowyg-plugins/resizimg/trumbowyg.resizimg.min': () => import('trumbowyg-plugins/resizimg/trumbowyg.resizimg.min'),
    'trumbowyg-plugins/table/trumbowyg.table.min': () => import('trumbowyg-plugins/table/trumbowyg.table.min'),
    'trumbowyg-langs/ru.min': () => import('trumbowyg-langs/ru.min'),
};

export function loadModules(ids, callback) {
    // Sequential loading preserves ordering for plugins that extend other plugins.
    const loading = ids.reduce((promise, id) => promise.then(async values => {
        if (!Object.hasOwn(modules, id)) {
            throw new Error('Unknown frontend module: ' + id);
        }

        values.push((await modules[id]()).default);

        return values;
    }), Promise.resolve([]));

    // Report failed chunk or stylesheet loads (e.g. after a deploy or network loss) instead of
    // leaving a silent unhandled rejection. Errors thrown by the callback still propagate as before.
    return loading.then(values => callback(...values), error => {
        console.error('Unable to load frontend modules', ids, error);
        noties.error({ message: i18n('Unable to load part of the page. Please refresh the page and try again') });
    });
}

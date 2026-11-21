/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import 'jquery';
import 'Utils';
import 'Params';
import 'globalVM';
import i18n from 'i18n';
import ko from 'knockout';
import Cliche from 'm/_moduleCliche';
import pug from 'tpl/dummy.pug?raw';
import 'style/dummy.css';

export default Cliche.extend({
    pug: pug,
    create: function () {
        this.dummytext = ko.observable(i18n('Stub'));
    },
});

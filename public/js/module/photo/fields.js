/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Browser', 'i18n'], function (Browser, i18n) {
    const dirIcons = {
        // Arrows are not unified accross browsers and platforms.
        // The choices we use [default, FF, Mac].
        n: ['&#xf1e0;', '🡡', '↑'],
        ne: ['&#xf1e1;', '🡥', '↗'],
        e: ['&#xf1df;', '🡢', '→'],
        se: ['&#xf1e4;', '🡦', '↘'],
        s: ['&#xf1e3;', '🡣', '↓'],
        sw: ['&#xf1e5;', '🡧', '↙'],
        w: ['&#xf1e6;', '🡠', '←'],
        nw: ['&#xf1e2;', '🡤', '↖'],
        aero: ['&#xe3f7;', '◎', '◎'],
    };

    const getDirIcon = function (dir) {
        const iconIndex = Browser.platform.indexOf('MAC') >= 0 ? 2 : Browser.name === 'FIREFOX' ? 1 : 0;

        if (iconIndex === 2 && !(dir === 'e' || dir === 'w' || dir === 'aero')) {
            // Ugly hack to align text in options on Mac.
            return dirIcons[dir][iconIndex] + '&nbsp;';
        }

        return dirIcons[dir][iconIndex];
    };

    return {
        getDirIcon: getDirIcon,
        s: 'Status',
        y: 'Year',
        geo: 'Coordinates',
        type: 'Type',
        regions: 'Region',
        title: 'Photo title',
        desc: 'Description',
        source: 'Source',
        author: 'Author',
        address: 'Shooting location address',
        dir: 'Shooting direction',
        typeVals: {
            1: 'Photograph',
            2: 'Painting/drawing',
        },
        types: ['1', '2'],
        dirVals: {
            n: i18n('North'),
            ne: i18n('Northeast'),
            e: i18n('East'),
            se: i18n('Southeast'),
            s: i18n('South'),
            sw: i18n('Southwest'),
            w: i18n('West'),
            nw: i18n('Northwest'),
            aero: i18n('Aerial/Satellite'),
        },
        dirValsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'],
        watersign: {
            'title': 'Watermark signature',
            'profile': 'As set in profile',
            'individual': 'Individually',
            'option': 'Add signature to watermark',
            'default': 'System settings',
            'text': 'Text',
        },
        watersignText: 'Watermark signature',
        watersignLength: 65,
        watersignPattern: /[\w\.,:;\(\)\[\]\\\|/№§©®℗℠™•\?!@#\$%\^&\*\+\-={}"'<>~` ]/g, //eslint-disable-line no-useless-escape
        downloadOrigin: {
            title: 'Original download',
            profile: 'As set in profile',
            individual: 'Individually',
            option: 'Allow other users to download the original',
        },

        painting: {
            title: 'Title',
        },
    };
});

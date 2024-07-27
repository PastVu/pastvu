/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Browser'], function (Browser) {
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
        address: 'Adress of shooting point',
        dir: 'Shooting direction',
        typeVals: {
            1: 'Photograph',
            2: 'Painting',
        },
        types: ['1', '2'],
        dirVals: {
            n: 'North',
            ne: 'Northeast',
            e: 'East',
            se: 'Southeast',
            s: 'South',
            sw: 'Southwest',
            w: 'West',
            nw: 'Northwest',
            aero: 'Aero/Satellite',
        },
        dirValsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'],
        watersign: {
            'title': 'Text on picture\'s watermark',
            'profile': 'As specified in profile',
            'individual': 'Individually',
            'option': 'Add text to picture\'s watermark',
            'default': 'System setting',
            'text': 'Text',
        },
        watersignText: 'Text on watermark',
        watersignLength: 65,
        watersignPattern: /[\w\.,:;\(\)\[\]\\\|/№§©®℗℠™•\?!@#\$%\^&\*\+\-={}"'<>~` ]/g, //eslint-disable-line no-useless-escape
        downloadOrigin: {
            title: 'Origin download',
            profile: 'As specified in profile',
            individual: 'Individually',
            option: 'Allow other users to download original',
        },

        painting: {
            title: 'Title',
        },
    };
});

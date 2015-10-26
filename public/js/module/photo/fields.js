/**
 * Модель статусов фотографии
 */
define(['underscore'], function () {
    return {
        s: 'Status',
        y: 'Year',
        geo: 'Coordinates',
        regions: 'Region',
        title: 'Photo title',
        desc: 'Description',
        source: 'Source',
        author: 'Author',
        address: 'Adress of shooting point',
        dir: 'Shooting direction',
        dirVals: {
            n: 'North',
            ne: 'Northeast',
            e: 'East',
            se: 'Southeast',
            s: 'South',
            sw: 'Southwest',
            w: 'West',
            nw: 'Northwest',
            aero: 'Aero/Satellite'
        },
        dirValsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'],
        watersign: {
            'title': 'Text on photo\'s watermark',
            'profile': 'As specified in profile',
            'individual': 'Individually',
            'option': 'Add text to photo\'s watermark',
            'default': 'System setting',
            'text': 'Text'
        },
        watersignText: 'Text on watermark',
        watersignLength: 65,
        watersignPattern: /[\w\.,:;\(\)\[\]\\\|/№§©®℗℠™•\?!@#\$%\^&\*\+\-={}"'<>~` ]/g,
        downloadOrigin: {
            title: 'Origin download',
            profile: 'As specified in profile',
            individual: 'Individually',
            option: 'Allow other users to download original'
        }
    };
});
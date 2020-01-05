import _ from 'lodash';

export const times = (function () {
    const msDay = 864e5;
    const times = {
        msDay, // Number of milliseconds in a day
        msWeek: 6048e5, // Number of milliseconds in a week
        msYear: 0, // Number of milliseconds in curretn year, computed

        midnight: null, // Milliseconds of midnight of current day
        midnightWeekAgo: null, // Milliseconds of midnight of seven days ago
        yearStart: null, // Milliseconds of surrent year begining
        yearDays: null, // Number of days in current year
    };

    // Calculate time values
    (function timesRecalc() {
        const current = new Date();
        const currentYear = current.getFullYear();

        times.midnight = new Date().setHours(0, 0, 0, 0);
        times.midnightWeekAgo = times.midnight - times.msWeek;
        times.yearStart = new Date(currentYear, 0, 1);
        times.msYear = new Date(currentYear + 1, 0, 1) - times.yearStart;
        times.yearDays = Math.floor(times.msYear / msDay);

        // Schedule computing on the first millisecond of next day
        setTimeout(timesRecalc, times.midnight + times.msDay - Date.now() + 1);
    }());

    return times;
}());

export const isThisYear = date => new Date(date).getFullYear() === new Date().getFullYear();
export const isYesterday = date => date >= times.midnight - times.msDay && date < times.midnight;
export const isToday = date => date >= times.midnight && date < times.midnight + times.msDay;
export const hhmmss = (ms, utc, delimeter) => {
    if (!_.isDate(ms)) {
        ms = new Date(ms);
    }

    if (!delimeter) {
        delimeter = ':';
    }

    const hours = ms[utc ? 'getUTCHours' : 'getHours']();
    const minutes = ms[utc ? 'getUTCMinutes' : 'getMinutes']();
    const seconds = ms[utc ? 'getUTCSeconds' : 'getSeconds']();

    return (hours > 9 ? hours : '0' + hours) +
        delimeter + (minutes > 9 ? minutes : '0' + minutes) +
        delimeter + (seconds > 9 ? seconds : '0' + seconds);
};
export const hhmmssms = (ms, utc, delimeter) => {
    if (!_.isDate(ms)) {
        ms = new Date(ms);
    }

    return `${hhmmss(ms, utc, delimeter)}.${ms[utc ? 'getUTCMilliseconds' : 'getMilliseconds']()}`;
};

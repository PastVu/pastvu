import ms from 'ms';
import _ from 'lodash';
import log4js from 'log4js';
import locale from 'locale';
import config from '../config';
import Utils from '../commons/Utils';
import { waitDb, dbEval } from './connection';
import * as regionController from './region';
import { parse as parseCookie } from 'cookie';
import { userSettingsDef, clientParams } from './settings';
import { Session, SessionArchive } from '../models/Sessions';
import { User } from '../models/User';
import constantsError from '../app/errors/constants';
import { AuthorizationError, ApplicationError, BadParamsError, NotFoundError/*, TimeoutError*/ } from '../app/errors';

const logger = log4js.getLogger('session');
const SESSION_COOKIE_KEY = 'past.sid'; // Session key in client cookies
const SESSION_SHELF_LIFE = ms('21d'); // Period of session validity since last activity

// Locales Map for checking their presence after header parsing
const localesMap = new Map(config.locales.map(locale => [locale, locale]));
// Default locale is the first one from config
const localeDefault = config.locales[0];
// Method for parsing and checking user-gent
export const checkUserAgent = Utils.checkUserAgent(config.browsers);

// Create cookie session object
export const createSidCookieObj = (function () {
    const key = SESSION_COOKIE_KEY;
    const domain = config.client.hostname;
    const cookieMaxAge = SESSION_SHELF_LIFE / 1000;

    return session => ({ key, domain, path: '/', value: session.key, 'max-age': cookieMaxAge });
}());

// Create cookie lang object (temporary)
const createLangCookieObj = (function () {
    const key = 'past.lang';
    const domain = config.client.hostname;
    const cookieMaxAge = SESSION_SHELF_LIFE / 1000;

    return lang => ({ key, domain, path: '/', value: lang, 'max-age': cookieMaxAge });
}());

const getBrowserAgent = function (browser) {
    const agent = {
        n: browser.agent.family, // Agent name e.g. 'Chrome'
        v: browser.agent.toVersion(), // Agent version string e.g. '15.0.874'
    };

    const device = browser.agent.device.toString(); // Device e.g 'Asus A100'
    const os = browser.agent.os.toString(); // Operation system e.g. 'Mac OSX 10.10.1'

    if (os) {
        agent.os = os;
    }

    if (device && device !== 'Other') {
        agent.d = device;
    }

    return agent;
};

// Determine user locale that we support based on 'accept-language' header
export const identifyUserLocale = (function () {
    // Locales for comparison
    const localesSuported = new locale.Locales(config.locales, localeDefault);

    return function (acceptLanguage) {
        if (_.isEmpty(acceptLanguage)) {
            return localeDefault; // If parameter is not specified, return default locale
        }

        // Find the most suitable locale for agent
        const suggestedLocale = new locale.Locales(acceptLanguage).best(localesSuported);

        return localesMap.get(suggestedLocale.normalized) || localesMap.get(suggestedLocale.language) || localeDefault;
    };
}());

export const getPlainUser = (function () {
    const userToPublicObject = function (doc, ret/* , options */) {
        // Transforms are applied to the document and each of its sub-documents.
        // Check that it's exactly user
        if (doc.login !== undefined) {
            delete ret.cid;
            delete ret.pass;
            delete ret.activatedate;
            delete ret.loginAttempts;
            delete ret.active;
            delete ret.__v;
        }

        delete ret._id;
    };

    return user => user && user.toObject ? user.toObject({ transform: userToPublicObject }) : null;
}());

// usObjs by session key. Hash of users object by session keys
// Several sessions can have one user object, if client loggedin through several devices
export const usSid = new Map();
// usObjs loggedin by user login. Hash of users object by registered users logins
export const usLogin = new Map();
// usObjs loggedin by user _id. Hash of users object by registered users _ids
export const usId = new Map();

export const sessConnected = new Map(); // Map of all the active sessions (by key) with established websocket connection
export const sessWaitingConnect = new Map(); // Map of the sessions (by key), which are waiting for websocket connection
export const sessWaitingSelect = new Map(); // Map of the sessions, which are waiting to be selected from the db

class UsObj {
    constructor(user, registered = false) {
        this.user = user;
        this.registered = registered;

        this.sessions = Object.create(null);
        this.rquery = Object.create(null);
        this.rshortsel = Object.create(null);
        this.rshortlvls = [];
        this.photoFilterTypes = [];
        this.photoFilterQuery = Object.create(null);
    }

    get isOwner() {
        return this.registered && this.user.role > 10;
    }

    get isAdmin() {
        return this.registered && this.user.role > 9;
    }

    get isModerator() {
        return this.registered && this.user.role === 5;
    }
}

// Emit data to specified socket
function emitSocket({ socket, data, waitResponse = false, timeout = 10000 }) {
    if (!Array.isArray(data)) {
        data = [data];
    }

    if (waitResponse) {
        return new Promise((resolve, reject) => {
            let overdue = false;
            const overdueTimeout = setTimeout(() => {
                overdue = true;
                resolve({ data: [] });
                // Replace with next when all clients are updated
                // reject(new TimeoutError({ timeout, data }));
            }, timeout);

            socket.binary(false).emit(...data, result => {
                if (overdue) {
                    return;
                }

                clearTimeout(overdueTimeout);

                if (_.get(result, 'error')) {
                    reject(result.error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    socket.binary(false).emit(...data);
}

// Send command to all session's sockets
const emitSessionSockets = (session, data, waitResponse, excludeSocket) => _.chain(session.sockets)
    .filter(socket => socket && socket !== excludeSocket && _.isFunction(socket.emit))
    .map(socket => emitSocket({ socket, data, waitResponse })).value();

const emitSidCookie = (socket, waitResponse) => emitSocket({
    socket,
    data: ['command', [{ name: 'updateCookie', data: createSidCookieObj(socket.handshake.session) }]],
    waitResponse,
});

const emitLangCookie = (socket, lang, waitResponse) => emitSocket({
    socket,
    data: ['command', [{ name: 'updateCookie', data: createLangCookieObj(lang) }]],
    waitResponse,
});

const sendReload = (session, waitResponse, excludeSocket) =>
    emitSessionSockets(session, ['command', [{ name: 'location' }]], waitResponse, excludeSocket);

// Send user to all his sockets
export async function emitUser({ usObj, login, userId, sessId, wait, excludeSocket }) {
    if (!usObj) {
        usObj = usLogin.get(login) || usId.get(userId) || usSid.get(sessId);
    }

    if (!usObj) {
        return 0;
    }

    const params = ['youAre', { user: getPlainUser(usObj.user), registered: usObj.registered }];
    const emits = _.reduce(usObj.sessions,
        (result, session) => result.concat(emitSessionSockets(session, params, wait, excludeSocket)), []
    );

    if (wait && emits.length) {
        await Promise.all(emits);
    }

    return emits.length;
}

// Save and send user to his sockets
export async function saveEmitUser({ usObj, login, userId, sessId, wait, excludeSocket }) {
    if (!usObj) {
        usObj = usLogin.get(login) || usId.get(userId) || usSid.get(sessId);
    }

    if (!usObj || !usObj.user) {
        return 0;
    }

    await usObj.user.save();

    return emitUser({ usObj, wait, excludeSocket });
}

// Create usObj in hashes (if doesn't exists) and add session to it
async function addSessionToUserObject(session, updateRid) {
    const registered = Boolean(session.user);
    let user = registered ? session.user : session.anonym;

    // For registered users we must get user through logins hash, so existing usObj will be selected,
    // if user has already loggedin through another device
    let usObj = registered ? usLogin.get(user.login) : usSid.get(session.key);
    let firstAdding = false;

    if (usObj === undefined) {
        firstAdding = true;

        usObj = new UsObj(user, registered);
        usSid.set(session.key, usObj);

        if (registered) {
            usId.set(user._id, usObj);
            usLogin.set(user.login, usObj);
            logger.info(`${this.ridMark} Create us hash: ${user.login}`);
        }
    } else if (registered) {
        // If user is already in hashes, he is logged in through another device
        // Insert into usSid by key of current session existing usObj and assign existing user to current session
        usSid.set(session.key, usObj);
        user = session.user = usObj.user;
        logger.info(`${this.ridMark} Add new session to us hash: ${user.login}`);
    } else {
        logger.warn(`${this.ridMark} Anonym trying to add new session?! Key: ${session.key}`);
    }

    if (updateRid) {
        this.addUserIdToRidMark(usObj, session);
    }

    usObj.sessions[session.key] = session; // Add session to sessions hash of usObj

    if (firstAdding) {
        await userObjectTreatUser(usObj);
    }

    return usObj;
}

function userObjectTreatUser(usObj) {
    const user = usObj.user;

    // Assign to user default settings
    user.settings = _.defaults(user.settings || {}, userSettingsDef);

    if (usObj.registered && user.settings.photo_filter_type.length &&
        !_.isEqual(user.settings.photo_filter_type, userSettingsDef.photo_filter_type)) {
        const types = user.settings.photo_filter_type;

        usObj.photoFilterTypes = types;
        usObj.photoFilterQuery = { type: types.length === 1 ? types[0] : { $in: types } };
    } else if (usObj.photoFilterTypes.length) {
        usObj.photoFilterTypes = [];
        usObj.photoFilterQuery = {};
    }

    return popUserRegions(usObj);
}

// Create and save session to db
async function createSession(ip, headers, browser) {
    const session = new Session({
        key: Utils.randomString(12),
        stamp: new Date(),
        data: {
            ip,
            headers,
            lang: config.lang,
            agent: getBrowserAgent(browser),
        },
        anonym: {
            regionHome: regionController.DEFAULT_HOME._id,
            regions: [],
        },
    });

    return session.save();
}

// Update session in db, if it was select from db at entrance
async function updateSession(session, ip, headers, browser) {
    const stamp = new Date();
    const data = session.data;

    // Update session stamp
    session.stamp = stamp;

    // If user is registered, zeroize 'anonym' field, because mongoose when select session from db, set 'anonym' to {}
    if (session.user) {
        session.anonym = undefined;
    }

    // If user ip is changed, write old one to history with change time
    if (ip !== data.ip) {
        if (!data.ip_hist) {
            data.ip_hist = [];
        }

        data.ip_hist.push({ ip: data.ip, off: stamp });
        data.ip = ip;
    }

    data.lang = config.lang;

    // If user-agent is changed, parse it and write previous one to history with change time
    if (headers['user-agent'] !== data.headers['user-agent']) {
        if (data.agent) {
            if (!data.agent_hist) {
                data.agent_hist = [];
            }

            data.agent_hist.push({ agent: data.agent, off: stamp });
        }

        data.agent = getBrowserAgent(browser);
    }

    data.headers = headers;
    session.markModified('data');

    return session.save();
}

// Create session as copy from transfered session (ip, header, agent)
function copySession(sessionSource) {
    const session = new Session({
        key: Utils.randomString(12),
        stamp: new Date(),
        data: _.pick(sessionSource.data, 'ip', 'headers', 'agent'),
    });

    return session;
}

// Add newly created or newly selected session in hashes
async function addSessionToHashes(session) {
    sessWaitingConnect.set(session.key, session);

    const usObj = await addSessionToUserObject.call(this, session);

    return usObj;
}

// Remove session from hashes, and remove usObj if it doesn't contains sessiona anymore
export function removeSessionFromHashes({ session: { key: sessionKey }, usObj, logPrefix = '' }) {
    const userKey = usObj.registered ? usObj.user.login : sessionKey;
    let someCountPrev;
    let someCountNew;

    logPrefix = `${_.get(this, 'ridMark', '')} ${logPrefix}`;

    sessWaitingConnect.delete(sessionKey);
    sessConnected.delete(sessionKey);

    someCountPrev = usSid.size;
    usSid.delete(sessionKey);
    someCountNew = usSid.size;

    // logger.info('Delete session from usSid', someCountNew);
    if (someCountNew !== someCountPrev - 1) {
        logger.warn(`${logPrefix} Session from usSid not removed (${sessionKey}) ${userKey}`);
    }

    someCountPrev = Object.keys(usObj.sessions).length;
    delete usObj.sessions[sessionKey];
    someCountNew = Object.keys(usObj.sessions).length;

    // logger.info('Delete session from usObj.sessions', someCountNew);
    if (someCountNew !== someCountPrev - 1) {
        logger.warn(`${logPrefix} WARN-Session from usObj not removed (${sessionKey}) ${userKey}`);
    }

    if (!someCountNew && usObj.registered) {
        // logger.info('Delete user from hashes', usObj.user.login);
        // If there is no more sessions in usObj of registered object, remove usObj of users hashes
        // (from usSid is already removed)
        usLogin.delete(usObj.user.login);
        usId.delete(usObj.user._id);
    }
}

// Send session to archive
async function archiveSession(session) {
    // Take plain object of session, with _id instead of populated objects
    const sessionPlain = session.toObject({ minimize: true, depopulate: true, versionKey: false });
    const archivingSession = new SessionArchive(sessionPlain);

    if (sessionPlain.user) {
        archivingSession.anonym = undefined;
    }

    await session.remove(); // Remove session from collections of active sessions
    await archivingSession.save(); // Save archive session to collection of archive sessions

    return archivingSession;
}

// Pupulate user regions and build queries for them
async function popUserRegions(usObj) {
    const user = usObj.user;
    const registered = usObj.registered;
    const pathPrefix = registered ? '' : 'anonym.';
    const paths = [
        {
            path: pathPrefix + 'regionHome',
            select: { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 },
        },
        { path: pathPrefix + 'regions', select: { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1 } },
    ];

    let modregionsEquals; // Profile regions and moderation regions are equals

    if (registered && user.role === 5) {
        modregionsEquals = _.isEqual(user.regions, user.mod_regions) || undefined;
        paths.push({ path: pathPrefix + 'mod_regions', select: { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1 } });
    }

    await user.populate(paths).execPopulate();

    let regionsData = regionController.buildQuery(user.regions);
    let shortRegions = regionController.getShortRegionsParams(regionsData.rhash);

    usObj.rhash = regionsData.rhash;
    usObj.rquery = regionsData.rquery;
    usObj.rshortlvls = shortRegions.lvls;
    usObj.rshortsel = shortRegions.sel;

    if (user.role === 5) {
        regionsData = regionController.buildQuery(user.mod_regions);
        shortRegions = regionController.getShortRegionsParams(regionsData.rhash);

        usObj.mod_rhash = regionsData.rhash;
        usObj.mod_rquery = regionsData.rquery;
        usObj.mod_rshortlvls = shortRegions.lvls;
        usObj.mod_rshortsel = shortRegions.sel;
    }

    if (!modregionsEquals) {
        delete usObj.mod_regions_equals;
    } else {
        usObj.mod_regions_equals = modregionsEquals;
    }

    return usObj;
}

// Reget user from db and populate all his dependencies
export async function regetUser(usObj, emitHim, excludeSocket) {
    if (!usObj.registered) {
        throw new ApplicationError(constantsError.SESSION_CAN_REGET_REGISTERED_ONLY);
    }

    const user = await User.findOne({ login: usObj.user.login }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    // Assign new user object to usObj and to all its sessions
    usObj.user = user;
    _.forOwn(usObj.sessions, session => {
        session.user = user;
    });

    await userObjectTreatUser(usObj);

    if (emitHim) {
        emitUser({ usObj, excludeSocket });
    }

    return user;
}

// Reget online users from db and populate all dependencies. Replace links in hashes with this new objects
// Receive 'all' or filter function
// Doesn't wait for execution, returns number of affected users immediately
// TODO: precess anonymouse users too, populate theirs regions
export function regetUsers(filterFn, emitThem) {
    let usersCount = 0;

    for (const usObj of usLogin.values()) {
        if (filterFn === 'all' || filterFn(usObj)) {
            regetUser(usObj, emitThem);
            usersCount++;
        }
    }

    return usersCount;
}

// Session treatment when user logging in, invokes from auth-controller
export async function loginUser({ user }) {
    const { socket, handshake: { session: sessionOld, usObj: usObjOld } } = this;
    const sessionNew = copySession(sessionOld);
    const sessHash = sessWaitingConnect.has(sessionOld.key) ? sessWaitingConnect : sessConnected;

    // Assign user to session
    sessionNew.user = user;

    // Remove propery of anonym user (it will remain in sessionOld)
    sessionNew.anonym = undefined;

    // Set link to old session
    sessionNew.previous = sessionOld.key;

    await sessionNew.save();

    // Add session to existing usObj or will create new usObj
    // usObj already exists if user already logged in on some other device (other session), in this case
    // user must be taken from usObj instaed of incoming
    const usObj = await addSessionToUserObject.call(this, sessionNew, true);

    user = usObj.user;

    // For all socket of currect (old) session assign new session and usObj
    if (_.isEmpty(sessionOld.sockets)) {
        logger.warn(`${this.ridMark} SessionOld have no sockets while login ${user.login}`);
    } else {
        _.forOwn(sessionOld.sockets, ({ handshake }) => {
            handshake.usObj = usObj;
            handshake.session = sessionNew;
        });

        // Transfer all sockets from old session to new
        sessionNew.sockets = sessionOld.sockets;
    }

    delete sessionOld.sockets;

    // Remove old session from sessions map
    this.call('session.removeSessionFromHashes', { usObj: usObjOld, session: sessionOld, logPrefix: 'loginUser' });

    // Put new session into sessions map
    sessHash.set(sessionNew.key, sessionNew);

    // Send old session to archive
    await archiveSession(sessionOld);

    // Update cookie in current socket, all browser tabs will see it
    emitSidCookie(socket);

    const userPlain = getPlainUser(user);

    // Send user to all sockets of session, except current socket (auth-controller will send user there)
    _.forOwn(sessionNew.sockets, sock => {
        if (sock !== socket && _.isFunction(sock.emit)) {
            sock.binary(false).emit('youAre', { user: userPlain, registered: true });
        }
    });

    return { session: sessionNew, userPlain };
}

// Session treatment when user exit, invokes from auth-controller
export async function logoutUser({ socket, usObj: usObjOld, session: sessionOld, currentSession = true }) {
    const sessionNew = copySession(sessionOld);
    const sessHash = sessWaitingConnect.has(sessionOld.key) ? sessWaitingConnect : sessConnected;

    const user = usObjOld.user;

    sessionNew.anonym.settings = user.toObject().settings;
    // Array of regions _ids
    sessionNew.anonym.regions = user.populated('regions') || [];
    // _id of user's home regions
    sessionNew.anonym.regionHome = user.populated('regionHome') || regionController.DEFAULT_HOME._id;

    // Set link to old session
    sessionNew.previous = sessionOld.key;

    await sessionNew.save();

    // Create new usObj and new session into it
    const usObj = await addSessionToUserObject.call(this, sessionNew, currentSession);

    // For all socket of currect (old) session assign new session and usObj
    if (_.isEmpty(sessionOld.sockets)) {
        logger.warn(`${this.ridMark} SessionOld have no sockets while logout ${user.login}`);
    } else {
        _.forOwn(sessionOld.sockets, ({ handshake }) => {
            handshake.usObj = usObj;
            handshake.session = sessionNew;
        });

        // Transfer all sockets from old session to new
        sessionNew.sockets = sessionOld.sockets;
    }

    delete sessionOld.sockets;

    // Remove old session from sessions map
    this.call('session.removeSessionFromHashes', {
        usObj: usObjOld, session: sessionOld, logPrefix: currentSession ? 'logoutCurrentUser' : 'logoutUser',
    });

    // Put new session in sessions map
    sessHash.set(sessionNew.key, sessionNew);

    // Send old session to archive
    await archiveSession(sessionOld);

    if (socket) {
        // Send client new cookie of anonym session
        await emitSidCookie(socket, true);
    }

    sendReload(sessionNew);
}


// Check user is online
export function isOnline({ login, userId, sessionKey } = {}) {
    if (login) {
        return usLogin.has(login);
    }

    if (userId) {
        return usId.has(userId);
    }

    if (sessionKey) {
        return usSid.has(sessionKey);
    }

    return false;
}

// Get online user
export function getOnline({ login, userId, sessionKey } = {}) {
    if (login) {
        return usLogin.get(login);
    }

    if (userId) {
        return usId.get(userId);
    }

    if (sessionKey) {
        return usSid.get(sessionKey);
    }
}

// Periodic process for dropping waiting connection sessions, if they don't establish connection in given time
const checkSessWaitingConnect = (function () {
    const SESSION_WAIT_CHECK_INTERVAL = ms('10s');
    const SESSION_WAIT_TIMEOUT = ms('1m');

    function procedure() {
        const expiredFrontier = Date.now() - SESSION_WAIT_TIMEOUT;
        let removedCount = 0;

        for (const [key, session] of sessWaitingConnect.entries()) {
            const stamp = new Date(session.stamp || 0).getTime();

            if (!stamp || stamp <= expiredFrontier) {
                removedCount++;
                removeSessionFromHashes({ usObj: usSid.get(key), session, logPrefix: 'checkSessWaitingConnect' });
            }
        }

        if (removedCount) {
            logger.info(`${removedCount} waiting sessions were removed from hashes`);
        }

        checkSessWaitingConnect();
    }

    return function () {
        setTimeout(procedure, SESSION_WAIT_CHECK_INTERVAL).unref();
    };
}());

// Periodically sends expired session to archive
const checkExpiredSessions = (function () {
    const checkInterval = ms('5m'); // Check interval

    async function procedure() {
        try {
            const result = await dbEval('archiveExpiredSessions', [new Date() - SESSION_SHELF_LIFE], { nolock: true });

            if (!result) {
                throw new ApplicationError(constantsError.SESSION_EXPIRED_ARCHIVE_NO_RESULT);
            }

            logger.info(`${result.count} sessions moved to archive`);

            // Check if some of archived sessions is still in memory (in hashes), remove it frome memory
            _.forEach(result.keys, key => {
                if (sessConnected.has(key)) {
                    const session = sessConnected.get(key);
                    const usObj = usSid.get(key);

                    if (usObj !== undefined) {
                        removeSessionFromHashes({ usObj, session, logPrefix: 'checkExpiredSessions' });
                    }

                    // If session contains sockets, break connection
                    _.forEach(session.sockets, socket => {
                        if (socket.disconnet) {
                            socket.disconnet();
                        }
                    });

                    delete session.sockets;
                }
            });
        } catch (err) {
            logger.error('archiveExpiredSessions error: ', err);
        }

        checkExpiredSessions(); // Schedule next launch
    }

    return function () {
        setTimeout(procedure, checkInterval);
    };
}());

// Handler of http-request or websocket-connection for session and usObj create/select
export async function handleConnection(ip, headers, overHTTP, req) {
    if (!headers || !headers['user-agent']) {
        // If session doesn't contain header or user-agent - deny
        throw new BadParamsError(constantsError.SESSION_NO_HEADERS, this.rid);
    }

    if (overHTTP) {
        // Ability to set most priority locale by header 'X-Facebook-Locale' or by 'fb_locale'/'locale' uri parameters
        // http://developers.facebook.com/docs/opengraph/guides/internationalization
        const localeOverride = headers['x-facebook-locale'] || req.query.fb_locale || req.query.locale;

        if (localeOverride) {
            if (req.headers['accept-language']) {
                req.headers['accept-language'] = localeOverride + ',' + req.headers['accept-language'];
            } else {
                req.headers['accept-language'] = localeOverride;
            }
        }
    }

    // Parse user-agent information
    const browser = checkUserAgent(headers['user-agent']);

    if (browser.badbrowser) {
        throw new BadParamsError({ code: constantsError.BAD_BROWSER, agent: browser.agent, trace: false }, this.rid);
    }

    const cookieObj = parseCookie(headers.cookie || ''); // Parse cookie
    const sid = cookieObj[SESSION_COOKIE_KEY]; // Get session key from cookie
    let session;
    let track;
    let usObj;

    if (!sid) {
        track = 'No incoming sid, creating new session';

        session = await createSession.call(this, ip, headers, browser);
        usObj = await addSessionToHashes.call(this, session);
    } else if ((sessConnected.has(sid) || sessWaitingConnect.has(sid)) && usSid.has(sid)) {
        // If key exists and such session already in hash, then just get this session
        // logger.info(this.ridMark, 'handleConnection', 'Get session from hash');

        track = `Session found among ${sessConnected.has(sid) ? 'connected' : 'waiting connect'} sessions`;
        session = sessConnected.get(sid) || sessWaitingConnect.get(sid);
        usObj = usSid.get(sid);
        this.addUserIdToRidMark(usObj, session);

        if (overHTTP) {
            // If client made http request again (open new browser tab), update session data, to set current stamp,
            // to postpone for this session checkSessWaitingConnect
            // And check if locale changed
            await updateSession.call(this, session, ip, headers, browser);
        }
    } else {
        // If session key is exists, but session not in hashes,
        // then select session from db, but if it's already selecting just wait promise

        if (!sessWaitingSelect.has(sid)) {
            sessWaitingSelect.set(sid, (async () => {
                try {
                    let session = await Session.findOne({ key: sid }).populate('user').exec();

                    // If session is found, update data in db and populate user
                    if (session) {
                        await updateSession.call(this, session, ip, headers, browser);
                    } else {
                        // If session with such key doesn't exist, create new one
                        track = 'Session has\'t been found in the db by the incoming sid, creating a new one';
                        session = await createSession.call(this, ip, headers, browser);
                    }

                    const usObj = await addSessionToHashes.call(this, session);

                    return { session, usObj };
                } finally {
                    // Remove promise from hash of waiting connect by session key, anyway - success or error
                    sessWaitingSelect.delete(sid);
                }
            })());
        } else {
            track = 'Session searching has already started, waiting for that promise';
        }

        ({ session, usObj } = await sessWaitingSelect.get(sid));
    }

    if (!usObj || !session) {
        logger.error(
            `${this.ridMark} Handling incoming ${overHTTP ? 'http' : 'websocket'} connection`,
            `finished with empty ${!usObj ? 'usObj' : 'session'}, incoming sid: ${sid}, track: ${track}`
        );

        throw new ApplicationError({ code: constantsError.SESSION_NOT_FOUND, agent: browser.agent, trace: false }, this.rid);
    }

    if (!overHTTP) {
        // Mark session as active (connected by websocket)
        sessConnected.set(session.key, session);
        // Delete from hash of waiting connection sessions
        sessWaitingConnect.delete(session.key);
    }

    return { usObj, session, browser, cookie: cookieObj };
}


// Try to get session
export async function getSessionLight({ sid }) {
    let session;
    let usObj;

    if ((sessConnected.has(sid) || sessWaitingConnect.has(sid)) && usSid.has(sid)) {
        // If key exists and such session already in hash, then just get this session
        session = sessConnected.get(sid) || sessWaitingConnect.get(sid);
        usObj = usSid.get(sid);
        this.addUserIdToRidMark(usObj, session);
    } else {
        if (!sessWaitingSelect.has(sid)) {
            sessWaitingSelect.set(sid, (async () => {
                try {
                    const session = await Session.findOne({ key: sid }).populate('user').exec();

                    if (!session) {
                        throw new ApplicationError({ code: constantsError.SESSION_NOT_FOUND, trace: false }, this.rid);
                    }

                    const usObj = await addSessionToHashes.call(this, session);

                    return { session, usObj };
                } finally {
                    // Remove promise from hash of waiting connect by session key, anyway - success or error
                    sessWaitingSelect.delete(sid);
                }
            })());
        }

        ({ session, usObj } = await sessWaitingSelect.get(sid));
    }

    if (!usObj || !session) {
        throw new ApplicationError({ code: constantsError.SESSION_NOT_FOUND, trace: false }, this.rid);
    }

    return { usObj, session };
}

async function giveUserSessions({ login }) {
    const { handshake: { usObj: iAm, session: sessionCurrent } } = this;

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const user = isOnline({ login }) ? getOnline({ login }).user : await User.findOne({ login }).exec();
    const sessions = await Session.find(
        { user: user._id },
        { _id: 0, key: 1, created: 1, stamp: 1, data: 1 },
        { lean: true, sort: { stamp: -1 } },
    ).exec();

    return sessions.map(({ key, created, stamp, data: { ip, agent } = {} }) => ({
        key, created, stamp,
        isOnline: sessConnected.has(key), isCurrent: key === sessionCurrent.key,
        sockets: sessConnected.has(key) ? Object.keys(sessConnected.get(key).sockets).length : 0,
        ip, os: agent.os, browser: `${agent.n} ${agent.v}`,
        device: typeof agent.d === 'string' && agent.d !== 'Other 0.0.0' ? agent.d.replace(/[0)]?\.0\.0$/, '').trim() : undefined,
    }));
}

// Destroy specific user session which is done by user itself or admin from Sessions page in user profile
async function destroyUserSession({ login, key: sid }) {
    if (sessWaitingSelect.has(sid)) {
        await sessWaitingSelect.get(sid);
    }

    if ((sessConnected.has(sid) || sessWaitingConnect.has(sid)) && usSid.has(sid)) {
        // If current session is online, call logout for that session, so all its sockets (browser tabs) will be reloaded
        const session = sessConnected.get(sid) || sessWaitingConnect.get(sid);
        const socket = Object.values(session.sockets)[0];
        const usObj = usSid.get(sid);

        await this.call('session.logoutUser', { socket, usObj, session, currentSession: false });
    } else {
        // If current session is offline, simply archive it
        try {
            await archiveSession(await Session.findOne({ key: sid }).exec());
        } catch (error) {}
    }

    return this.call('session.giveUserSessions', { login });
}

// Destroy all user sessions, is done by admin while changing login user restriction from on to off on manage page
async function destroyUserSessions({ login }) {
    const sessions = await this.call('session.giveUserSessions', { login });

    await Promise.all(sessions.map(session => this.call('session.destroyUserSession', { login, key: session.key })));
}

async function langChange(data) {
    const { socket, handshake: { session } } = this;

    if (!config.locales.includes(data.lang)) {
        return;
    }

    // Send client new language cookie
    await emitLangCookie(socket, data.lang, true);

    sendReload(session);
}

function giveInitData() {
    const { socket, handshake: { session, usObj: iAm } } = this;

    // Several client modules can have subscribtion for 'takeInitData',
    // that's why use emit data instead of acknowledgment callback
    emitSocket({
        socket,
        data: ['takeInitData', {
            p: clientParams,
            u: getPlainUser(iAm.user),
            registered: iAm.registered,
            cook: createSidCookieObj(session),
        }],
    });
}

giveUserSessions.isPublic = true;
destroyUserSession.isPublic = true;
giveInitData.isPublic = true;
langChange.isPublic = true;

export default {
    giveUserSessions,
    destroyUserSession,
    destroyUserSessions,
    loginUser,
    logoutUser,
    giveInitData,
    langChange,

    removeSessionFromHashes,
    getSessionLight,
    emitSocket,
    regetUsers,
};

waitDb.then(() => {
    checkSessWaitingConnect();
    checkExpiredSessions();
});

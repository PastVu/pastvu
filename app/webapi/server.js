/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import util from 'util';
import log4js from 'log4js';
import config from '../../config';
import * as methods from './methods';
import Utils from '../../commons/Utils';
import NotFoundError from '../errors/NotFound';
import ApplicationError from '../errors/Application';
import constants from '../../controllers/constants';

const methodsHash = Utils.flattenObject(methods);

/**
 * Return logger for methods group (photo, comments, region, etc.)
 * In result will be logger "webapi-photo", "webapi-comments", "webapi-region" and etc.
 */
const getMethodLogger = (function () {
    const LOG_CATEGORY = 'webapi';
    const commonLog = log4js.getLogger(LOG_CATEGORY);
    const loggersMap = _.transform(methodsHash, (map, value, name) => {
        map.set(name, log4js.getLogger(`${LOG_CATEGORY}-${name.split('.', 1)[0]}`));
    }, new Map());

    return methodName => loggersMap.get(methodName) || commonLog;
}());

/**
 * Inspect data to logger
 */
const inspect = (function () {
    const inspectOptions = { depth: null, colors: config.env === 'development' };

    return obj => util.inspect(obj, inspectOptions);
}());

export default async function callMethod(methodName, params = {}, isPublic = false) {
    const start = Date.now();
    const method = methodsHash[methodName];
    const logger = getMethodLogger(methodName);

    if (!this.rid) {
        logger.warn(`No request context for ${methodName} calling`);
    }

    if (typeof method !== 'function') {
        logger.error(`${this.ridMark} No such method "${methodName}" with params:`, inspect(params));
        throw new NotFoundError({ code: constants.NO_SUCH_METHOD, methodName, logged: true });
    }

    if (isPublic && !method.isPublic) {
        logger.error(
            `${this.ridMark} Somebody from the outside trying to call private method "${methodName}" with params:`,
            inspect(params)
        );
        throw new NotFoundError({ code: constants.NO_SUCH_METHOD, methodName, logged: true });
    }

    logger.info(`${this.ridMark} Calling webapi method "${methodName}"`);
    // logger.debug(`${this.ridMark} Params:`, inspect(params));

    try {
        const call = method.call(this, params);
        const result = call && typeof call.then === 'function' ? await call : call;
        const elapsed = Date.now() - start;

        logger.info(`${this.ridMark} webapi method "${methodName}" has executed in ${elapsed}ms`);
        // logger.debug(`${this.ridMark} Response:`, inspect(result));
        this.trace.push({ type: 'webapi', method: methodName, ms: elapsed });

        return result;
    } catch (err) {
        let error = err;

        if (error instanceof ApplicationError) {
            if (!error.logged) {
                // If it handled error (with our type), inspect it through our toJSON method
                logger.error(_.compact([
                    `${this.ridMark} Error calling method "${methodName}" with params: ${inspect(params)}`,
                    `${inspect(error.toJSON())}`,
                    error.trace ? error.stack : undefined,
                ]).join('\n'));
            }

            throw error;
        }

        // If it unhandled error (some unpredictable runtime), log it and throw our UNHANDLED_ERROR further
        logger.error(
            `${this.ridMark} Error calling method "${methodName}" with params: ${inspect(params)}\n`,
            error.stack
        );
        error = new ApplicationError(constants.UNHANDLED_ERROR);

        error.setLogged(); // Do not log this error anymore, because it was logged here

        throw error;
    }
}

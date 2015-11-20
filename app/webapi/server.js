import _ from 'lodash';
import util from 'util';
import log4js from 'log4js';
import methods from './methods';
import Bluebird from 'bluebird';
import config from '../../config';
import Utils from '../../commons/Utils';
import APIError from '../errors/APIError';
import constants from '../../controllers/constants';

const methodsHash = Utils.flattenObject(methods);

function unhandledErrorFilter(error) {
    return !(error instanceof APIError);
}

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

    if (!method) {
        logger.error(`${this.ridMark} No such method "${methodName}" with params:`, inspect(params));
        throw new APIError(constants.NO_SUCH_METHOD, 'Bad request. No such method');
    }

    if (isPublic && !method.isPublic) {
        logger.error(
            `${this.ridMark} Somebody from the outside trying to call private method "${methodName}" with params:`, inspect(params)
        );
        throw new APIError(constants.NO_SUCH_METHOD, 'Bad request. No such method');
    }

    logger.info(`${this.ridMark} Calling method "${methodName}"`);
    // logger.debug(`${this.ridMark} Params:`, inspect(params));

    try {
        const result = await Bluebird.try(method, [params], this);  // Use try, because not all methods return promise
        const elapsed = Date.now() - start;

        logger.info(`${this.ridMark} WebApi Method "${methodName}" has executed in ${elapsed}ms`);
        // logger.debug(`${this.ridMark} Response:`, inspect(result));
        this.trace.push({ type: 'webapi', method: methodName, ms: elapsed });

        return result;
    } catch (err) {
        let error = err;

        logger.error(`${this.ridMark} Error calling method "${methodName}" with params:`, inspect(params));
        logger.error(`${this.ridMark}`, error);

        if (unhandledErrorFilter(error)) {
            error = new APIError(constants.UNHANDLED_ERROR);
        }

        throw error;
    }
};
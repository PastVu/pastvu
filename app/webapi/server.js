import _ from 'lodash';
import util from 'util';
import log4js from 'log4js';
import config from '../config';
import methods from './methods';
import Utils from '../../commons/Utils';
import APIError from '../errors/APIError';
import constants from '../../controllers/constants';

const methodsHash = Utils.flattenObject(methods);
const LOG_CATEGORY = 'webapi';
const commonLog = log4js.getLogger(LOG_CATEGORY);

function unhandledErrorFilter(error) {
    return !(error instanceof APIError);
}

/**
 * Return logger for methods group (photo, comments, region, etc.)
 * In result will be logger "webapi-photo", "webapi-comments", "webapi-region" and etc.
 */
const getMethodLogger = (function () {
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

export default async function callMethod(methodName, params) {
    const start = Date.now();
    const method = methodsHash[methodName];
    const logger = method ? getMethodLogger(methodName) : commonLog;

    // Метод можно вызвать как с дополнительными параметрами для создания контекста,
    // так и уже в контексте этих параметров (например, из другого метода)
    if (!this.rid) {
        logger.warn(`No request context for ${methodName} calling`);
    }

    logger.info(`${this.ridMark} Calling method "${methodName}"`);
    logger.debug(`${this.ridMark} Params:`, inspect(params));

    try {
        const result = await method.call(this, params);
        const elapsed = Date.now() - start;

        logger.info(`${this.ridMark} WebApi Method "${methodName}" has executed in ${elapsed}ms`);
        logger.debug(`${this.ridMark} Response:`, inspect(result));
        this.trace.push({ type: 'webapi', method: methodName, ms: elapsed });

        return result;
    } catch (err) {
        let error = err;

        if (unhandledErrorFilter(error)) {
            error = new APIError(constants.UNHANDLED_ERROR);
        }

        logger.error(`${this.ridMark} Error calling method "${methodName}":`, error);

        throw error;
    }
};
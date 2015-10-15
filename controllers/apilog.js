import log4js from 'log4js';
import { waitDb } from './connection';
import { ApiLog } from '../models/ApiLog';

const logger = log4js.getLogger('api.js');
const bulk = [];
const bulkMaxLength = 200;
let saveLogTimeout;

export function logIt(appid, rid, rstamp, method, data, stamp, ms, status, errorCode, errorMessage) {
    var obj = {
        app: appid, stamp: stamp, ms: ms,
        rid: rid, rstamp: rstamp,
        method: method, data: data,
        status: status
    };
    if (errorCode) {
        obj.err_code = errorCode;
    }
    if (errorMessage) {
        obj.err_msg = errorMessage;
    }
    bulk.push(obj);

    //Если размер планируемого к сохранению достиг максимального, сразу сохраняем и сбрасываем
    if (bulk.length === bulkMaxLength) {
        saveLog();
    }
}

function scheduleLogSave() {
    saveLogTimeout = setTimeout(saveLog, 1e3);
}
function saveLog() {
    clearTimeout(saveLogTimeout);
    if (bulk.length) {
        ApiLog.collection.insert(bulk, { forceServerObjectId: true, checkKeys: false }, function (err) {
            if (err) {
                logger.error(err);
            }
            scheduleLogSave();
        });
        bulk = []; //Сбрасываем массив
    } else {
        scheduleLogSave();
    }
}

waitDb.then(scheduleLogSave);

module.exports.loadController = function () {
};
module.exports.logIt = logIt;
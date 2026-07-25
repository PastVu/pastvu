/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import log4js from 'log4js';
import { waitDb } from './connection';
import { ApiLog } from '../models/ApiLog';

const logger = log4js.getLogger('api.js');
let bulk = [];
const bulkMaxLength = 200;
let saveLogTimeout;

export function logIt(appid, rid, rstamp, method, data, stamp, ms, status, errorCode, errorMessage) {
    const obj = {
        app: appid, stamp, ms,
        rid, rstamp,
        method, data,
        status,
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
        ApiLog.collection.insertMany(bulk, { forceServerObjectId: true, checkKeys: false }, err => {
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

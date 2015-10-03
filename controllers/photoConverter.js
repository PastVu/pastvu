import _ from 'lodash';
import ms from 'ms';
import gm from 'gm';
import path from 'path';
import log4js from 'log4js';
import mkdirp from 'mkdirp';
import moment from 'moment';
import Bluebird from 'bluebird';
import Utils from '../commons/Utils';
import { exec } from 'child_process';

const sleep = time => new Promise(resolve => setTimeout(resolve, time));
const mkdirpAsync = Bluebird.promisify(mkdirp);
const execAsync = Bluebird.promisify(exec);
const logger = log4js.getLogger('photoConverter.js');
let dbNative;
let dbEval;
let Photo;
let PhotoConveyer;
let PhotoConveyerError;
let STPhotoConveyer;

let conveyerEnabled = true;
let conveyerLength = 0;
let conveyerMaxLength = 0;
let conveyerConverted = 0;

const sourceDir = global.appVar.storePath + 'private/photos/';
const targetDir = global.appVar.storePath + 'public/photos/';
const waterDir = path.join(__dirname, '/../misc/watermark/');

const maxWorking = 6; // Possible to convert in parallel
let goingToWork = 0; // Выборка для дальнейшей конвертации
let working = 0; // Now converting

const imageVersions = {
    a: {
        parent: sourceDir,
        desc: 'Origin with watermark',
        dir: 'a/',
        quality: 86,
        noTransforn: true,
        water: true
    },
    d: {
        parent: sourceDir,
        desc: 'Standard for photo page',
        dir: 'd/',
        quality: 82,
        width: 1050,
        height: 700,
        strip: true,
        postfix: '>',
        water: true
    },
    h: {
        parent: sourceDir,
        desc: 'Thumb',
        dir: 'h/',
        quality: 80,
        width: 246,
        height: 164,
        strip: true,
        filter: 'Sinc',
        gravity(w, h, w2, h2) {
            const result = { gravity: 'Center', extent: { w: w2, h: h2 } };
            const aspect = w / h;
            let newH; // Высота после пропорционального уменьшения ширины

            if (aspect <= 0.75) {
                // Портретная вытянутая более чем на 1.3(3)
                // Гравитация - север с отступом сверху 10% (но не более чем до края)
                newH = h * w2 / w;
                result.gravity = 'North';
                result.extent.options = '+0+' + (Math.min(newH * 0.1, (newH - h2) / 2) >> 0);
            } else if (aspect < 0.97) {
                // Портретная не сильно вытянутая
                // Гравитация - центр с отступом от центра наверх 10% (но не более чем до края)
                newH = h * w2 / w;
                result.extent.options = '+0-' + (Math.min(newH * 0.1, (newH - h2) / 2) >> 0);
            }

            return result;
        },
        postfix: '^'
    },
    m: {
        parent: 'h',
        desc: 'Midi',
        dir: 'm/',
        width: 150,
        height: 100,
        filter: 'Sinc',
        gravity: 'Center',
        postfix: '^'
    },
    q: {
        parent: 'm',
        desc: 'Mini',
        dir: 'q/',
        width: 90,
        height: 60,
        gravity: 'Center',
        postfix: '^'
    },
    s: {
        parent: 'm',
        desc: 'Micro',
        dir: 's/',
        width: 60,
        height: 60,
        gravity: 'Center',
        postfix: '^'
        // crop: true // Crop занимает больше места чем ресайз http://www.imagemagick.org/discourse-server/viewtopic.php?f=1&t=20415
    },
    x: {
        parent: 's',
        desc: 'Micros',
        dir: 'x/',
        width: 40,
        height: 40,
        gravity: 'Center',
        postfix: '^'
    }
};
const imageVersionsPriority = fillImgPrior(sourceDir, 0);
const imageVersionsKeys = Object.keys(imageVersionsPriority).sort((a, b) => (imageVersionsPriority[a] - imageVersionsPriority[b]));

const waterMarkGen = (function () {
    const waterFontPath = path.normalize(waterDir + 'AdobeFanHeitiStd-Bold.otf');
    const logo = path.normalize(waterDir + 'logo.png');
    const base = {
        height: 600,
        pointsize: 12,
        splice: 14,
        logo: 12,
        indent_logo_l: 2,
        indent_logo_r: 3,
        indent_label_b: 1
    };

    return function (options) {
        let multiplier = 1;
        let params = base;

        if (options.h > base.height) {
            multiplier = options.h / base.height;
            params = _.mapValues(params, function (n) {
                return Math.round(n * multiplier);
            });
        }

        const offset = (params.splice - params.pointsize) / 2;
        let offsetBottomText = (Utils.isOdd(params.pointsize) ? Math.floor(offset) : offset) + Math.floor(offset / 2);

        if (offsetBottomText > 4) {
            offsetBottomText += Math.floor(offset / 2);
        }

        const textPosition = `+${Math.round(params.indent_logo_l + params.logo + params.indent_logo_r)}+${offsetBottomText}`;

        return {
            params,
            commands: [
                `-gravity South`,
                `-background '#555555'`, // #285991
                `-splice 0x${params.splice}`,
                `-gravity Southwest`,
                `-font ${waterFontPath}`,
                `-pointsize ${params.pointsize}`,
                `-stroke none`,
                `-fill '#f2f2f2'`,
                `-annotate ${textPosition} '${options.txt}'`,
                `\\( ${logo} -resize ${params.logo} \\)`,
                `-geometry +${params.indent_logo_l}+${Math.floor(offset)}`,
                `-composite`
            ]
        };
    };
}());

function fillImgPrior(parent, level) {
    return _.transform(imageVersions, function (result, item, key) {
        if (item.parent === parent) {
            result[key] = level;
            _.assign(result, fillImgPrior(key, level + 1));
        }
    });
}

// Собираем статистику конвейера на начало каждой 10-минутки
function CollectConveyerStat() {
    const st = new STPhotoConveyer({
        stamp: new Date(+(moment().utc().startOf('minute'))),
        clength: conveyerMaxLength,
        converted: conveyerConverted
    });
    st.save(function (err) {
        if (err) {
            logger.error('STPhotoConveyer error.\n ' + err);
        }
    });

    conveyerMaxLength = conveyerLength;
    conveyerConverted = 0;
    setTimeout(CollectConveyerStat, ms('10m'));
}

/**
 * Очищает конвейер, кроме тех фотографий, которые сейчас конвертируются
 */
async function conveyerClear() {
    try {
        const removed = (await PhotoConveyer.removeAsync({ converting: { $exists: false } }))[0];

        conveyerLength = await PhotoConveyer.countAsync({});
        return { message: `Cleared ok! Removed ${removed}, left ${conveyerLength}` };
    } catch (err) {
        return { message: err || 'Error occurred', error: true };
    }
}

/**
 * Контроллер конвейера. Выбирает очередное фото из очереди и вызывает шаг конвейера
 */
async function conveyerControl() {
    const toWork = maxWorking - goingToWork - working;

    if (!conveyerEnabled || toWork < 1) {
        return;
    }
    goingToWork += toWork;

    const files = await PhotoConveyer.find({ converting: { $exists: false } })
        .sort({ priority: 1, added: 1 })
        .limit(toWork)
        .execAsync();

    goingToWork -= toWork - files.length;

    if (!files.length) {
        return;
    }

    for (const photoConv of files) {
        goingToWork -= 1;
        working += 1;

        const photo = await Photo
            .findOne(
                { cid: photoConv.cid },
                { cid: 1, file: 1, type: 1, user: 1, w: 1, h: 1, ws: 1, hs: 1, conv: 1, convqueue: 1, watersignText: 1 }
            )
            .populate({ path: 'user', select: { _id: 0, login: 1 } })
            .execAsync();

        photo.conv = true;
        photoConv.converting = true;
        await* [photo.saveAsync(), photoConv.saveAsync()];

        try {
            await conveyerStep(photo, photoConv);
            conveyerConverted += 1;
        } catch (err) {
            const errorObject = { cid: photoConv.cid, added: photoConv.added, error: String(err && err.message) };

            logger.error(errorObject);
            await new PhotoConveyerError(errorObject).saveAsync();
        }

        photo.conv = undefined; // Присваиваем undefined, чтобы удалить свойства
        photo.convqueue = undefined;
        await* [photo.saveAsync(), photoConv.removeAsync()];

        working -= 1;
        if (conveyerLength) {
            conveyerLength -= 1;
        }
        conveyerControl();
    }
}

const identifyImage = (src, format) =>
    new Promise((resolve, reject) => gm(src).identify(format, (err, result) => {
        if (err) {
            return reject(err);
        }

        try {
            result = JSON.parse(result);
        } catch (e) {
            return reject(e);
        }

        resolve(result);
    }));

// const writeImage = (dst, gmInstance) =>
// new Promise((resolve, reject) => gmInstance.write(dst, (err, result) => err ? reject(err) : resolve(result)));

const originIdentifyString = '{"w": "%w", "h": "%h", "f": "%C", "signature": "%#"}';

function getWatertext(photo) {
    return `pastvu.com/${photo.cid}  ${photo.watersignText || ''}`;
}

/**
 * Очередной шаг конвейера
 * @param photo Объект фотографии
 */
async function conveyerStep(photo, { webpOnly = false }) {
    const cid = photo.cid;
    const waterTxt = getWatertext(photo);
    const lossless = photo.type === 'image/png';
    const originSrcPath = path.normalize(sourceDir + photo.file);
    const saveStandardSize = function (result) {
        photo.ws = parseInt(result.w, 10) || undefined;
        photo.hs = parseInt(result.h, 10) || undefined;
    };
    const saveStandardSign = function (result) {
        photo.signs = result.signature ? result.signature.substr(0, 7) + result.signature.substr(result.signature.length - 3) : undefined;
    };
    const makeWebp = (variantName, dstPath) => tryPromise(5,
        () => execAsync(`cwebp -preset photo -m 5 ${lossless ? '-lossless ' : ''}${dstPath} -o ${dstPath}.webp`),
        `convert ${variantName}-variant to webp of photo ${cid}`
    );

    if (!webpOnly) {
        // Запускаем identify оригинала
        await tryPromise(5, () => identifyImage(originSrcPath, originIdentifyString), `identify origin of photo ${cid}`)
            .then(function (result) {
                photo.w = parseInt(result.w, 10) || undefined;
                photo.h = parseInt(result.h, 10) || undefined;
                photo.format = result.f || undefined;
                photo.sign = result.signature || undefined;
            });
    }

    for (const variantName of imageVersionsKeys) {
        const isOriginal = variantName === 'a';
        const variant = imageVersions[variantName];
        const srcDir = variant.parent === sourceDir ? sourceDir : targetDir + imageVersions[variant.parent].dir;
        const srcPath = path.normalize(srcDir + photo.file);
        const dstDir = path.normalize(targetDir + variant.dir + photo.file.substr(0, 5));
        const dstPath = path.normalize(targetDir + variant.dir + photo.file);

        if (webpOnly) {
            await makeWebp(variantName, dstPath);
            continue;
        }

        let commands = [`convert ${srcPath}`];

        if (variant.strip) {
            commands.push(`-strip`);
        }
        if (variant.filter) {
            commands.push(`-filter ${variant.filter}`);
        }
        if (variant.quality) {
            commands.push(`-quality ${variant.quality}`);
        }

        await mkdirpAsync(dstDir);

        if (!variant.noTransforn) {
            if (variant.crop) {
                if (variant.gravity) {
                    commands.push(`-gravity ${variant.gravity}`);
                }
                commands.push(`-crop '${variant.width}x${variant.height}'`);
            } else {
                commands.push(`-resize '${variant.width}x${variant.height}${variant.postfix || ''}'`);

                if (variant.gravity) {
                    // Generating preview by cut aspect from center of photo
                    // Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
                    const gravity = _.isFunction(variant.gravity) ?
                        variant.gravity(photo.w, photo.h, variant.width, variant.height) : { gravity: variant.gravity };
                    const extent = _.isObject(gravity) && gravity.extent ?
                        gravity.extent : { w: variant.width, h: variant.height };

                    commands.push(`-gravity ${gravity.gravity}`);
                    commands.push(`-extent '${extent.w}x${extent.h}${extent.options || ''}'`);
                }
            }
        }

        commands.push(dstPath);

        // Convert photo. For full size ('a') we need straight convert with watermark, because we know origin size
        if (!isOriginal) {
            // console.log(variantName, commands.join(' '));
            await tryPromise(5,
                () => execAsync(commands.join(' ')), `convert to ${variantName}-variant of photo ${cid}`
            );
        }

        // For standard photo we must get result size before creating watermark, because it depends on those sizes
        if (variantName === 'd') {
            await tryPromise(
                6, () => identifyImage(dstPath, '{"w": "%w", "h": "%h"}'), `identify standard size of photo ${cid}`
            ).then(saveStandardSize);
        }

        if (variant.water) {
            const watermark = waterMarkGen({
                w: isOriginal ? photo.w : photo.ws,
                h: isOriginal ? photo.h : photo.hs,
                txt: waterTxt
            });

            commands.pop();
            commands = commands.concat(watermark.commands);
            commands.push(dstPath);
            // console.log(variantName, commands.join(' '));
            await tryPromise(5,
                () => execAsync(commands.join(' ')), `convert to ${variantName}-variant of photo ${cid}`
            );

            if (photo.watersignText) {
                photo.watersignTextApplied = new Date();
            }

            photo[isOriginal ? 'waterh' : 'waterhs'] = watermark.params.splice;
            if (variantName === 'd') {
                photo.hs -= watermark.params.splice;
            }
        }

        // For standard photo we must get signature after watermark, to consider it as well
        if (variantName === 'd') {
            await tryPromise(6,
                () => identifyImage(dstPath, '{"signature": "%#"}'),
                `identify sign ${variantName}-variant of photo ${photo.cid}`
            ).then(saveStandardSign);
        }

        await sleep(25);
        await makeWebp(variantName, dstPath);
        await sleep(25); // Have a sleep to give file system time to save variant, for staying on the safe side
    }
}

async function tryPromise(attemps, promiseGenerator, data, attemp) {
    try {
        return await promiseGenerator(attemp);
    } catch (err) {
        if (!attemp) {
            attemp = 1;
        }
        if (!attemps) {
            attemps = 1;
        }

        if (attemp < attemps) {
            await sleep(100 * attemp);
            logger.warn(`Trying execute the promise ${attemp + 1}th time. ${data || ''}`);
            return await tryPromise(attemps, promiseGenerator, data, attemp + 1);
        }

        logger.error(
            `After ${attemps} attemps promise execution considered failed. ${data || ''}
            ${err}`
        );
        throw err;
    }
}

/**
 * Method for add photos to the conveyer
 * @param data Array of objects like {cid: 123}
 * @param priority Priority of convertation in conveyer
 */
export async function addPhotos(data, priority) {
    const toConvertObjs = [];
    const stamp = new Date();

    for (const photo of data) {
        const cid = Number(photo.cid);

        if (cid > 0) {
            toConvertObjs.push({ cid, priority: priority || 4, added: stamp });
        }
    }

    if (toConvertObjs.length) {
        await PhotoConveyer.collection.insertAsync(toConvertObjs, { safe: true });

        conveyerLength += toConvertObjs.length;
        conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);

        conveyerControl();
    }

    return { message: toConvertObjs.length + ' photos added to convert conveyer' };
}

/**
 * Добавление в конвейер конвертации всех фотографий
 * @param params Объект
 */
export async function addPhotosAll(params) {
    const result = await dbEval('function (params) {return convertPhotosAll(params);}', [params], { nolock: true });

    if (result && result.error) {
        throw { message: result.message || '' };
    }

    conveyerLength += result.conveyorAdded;
    conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);
    conveyerControl();

    return result;
}

/**
 * Удаление фотографий из конвейера конвертаций
 * @param data Массив cid
 * @param {function} [cb] Коллбэк успешности удаления
 */
export function removePhotos(data, cb) {
    PhotoConveyer.remove({ cid: { $in: data } }, function (err, docs) {
        if (cb) {
            cb(err);
        }
        conveyerLength -= docs.length;
    });
}

export function loadController(app, db, io) {
    dbNative = db.db;
    /* jshint evil:true */
    dbEval = Bluebird.promisify(dbNative.eval, dbNative);
    /* jshint evil:false */

    Photo = db.model('Photo');
    PhotoConveyer = db.model('PhotoConveyer');
    PhotoConveyerError = db.model('PhotoConveyerError');
    STPhotoConveyer = db.model('STPhotoConveyer');

    // Запускаем конвейер после рестарта сервера, устанавливаем все недоконвертированные фото обратно в false
    setTimeout(function () {
        PhotoConveyer.update({ converting: { $exists: true } }, { $unset: { converting: 1 } }, { multi: true }, function (err) {
            if (err) {
                logger.error(err);
                return;
            }
            conveyerControl();
        });
    }, 5000);

    PhotoConveyer.count({}, function (err, count) {
        if (err) {
            logger.error(err);
            return;
        }

        conveyerLength = Math.max(count, conveyerMaxLength);
        conveyerMaxLength = conveyerLength;
    });

    // Планируем запись статистики конвейера на начало следующей 10-минутки
    const hourStart = +(moment().utc().startOf('hour'));
    setTimeout(CollectConveyerStat, hourStart + ms('10m') * Math.ceil((Date.now() - hourStart) / ms('10m')) - Date.now() + 10);

    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        (function () {
            socket.on('conveyorStartStop', function (value) {
                if (_.isBoolean(value)) {
                    conveyerEnabled = value;
                    if (value) {
                        conveyerControl();
                    }
                }
                socket.emit('conveyorStartStopResult', { conveyerEnabled });
            });
        }());

        (function () {
            socket.on('conveyerClear', async function (value) {
                if (value === true) {
                    conveyerEnabled = value;
                    socket.emit('conveyerClearResult', await conveyerClear());
                }
            });
        }());

        (function () {
            function result(data) {
                socket.emit('getStatConveyer', data);
            }

            socket.on('statConveyer', async function () {
                if (!hs.usObj.registered) {
                    return result({ message: 'Not authorized for statConveyer', error: true });
                }

                const docs = await STPhotoConveyer.findAsync({}, { _id: 0, __v: 0 }, { sort: 'stamp', lean: true });

                for (const doc of docs) {
                    doc.stamp = doc.stamp.getTime();
                }

                result({ data: docs });
            });
        }());

        (function statFast() {
            socket.on('giveStatFastConveyer', function () {
                socket.emit('takeStatFastConveyer', {
                    conveyerEnabled,
                    clength: conveyerLength,
                    cmaxlength: conveyerMaxLength,
                    converted: conveyerConverted
                });
            });
        }());

    });
}

/**
 a - origin
 b
 c
 d - standard 1050x700
 e
 f
 g
 h - thumb 246x164
 i
 j
 k
 l
 m - midi 150x100
 n
 o
 p
 q - mini 90x60
 r
 s - micro 60x60
 t
 u
 v
 w
 x - micros 40x40
 y
 z
 */
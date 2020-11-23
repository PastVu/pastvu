import { promises as fsAsync } from 'fs';
import ms from 'ms';
import gm from 'gm';
import _ from 'lodash';
import path from 'path';
import util from 'util';
import log4js from 'log4js';
import makeDir from 'make-dir';
import moment from 'moment';
import config from '../config';
import constants from './constants';
import Utils from '../commons/Utils';
import childProcess from 'child_process';
import { waitDb, dbEval } from './connection';
import { Photo, PhotoConveyer, PhotoConveyerError, STPhotoConveyer } from '../models/Photo';
import constantsError from '../app/errors/constants';
import { ApplicationError, AuthorizationError } from '../app/errors';

const execAsync = util.promisify(childProcess.exec);
const logger = log4js.getLogger('converter.js');
const sleep = time => new Promise(resolve => setTimeout(resolve, time));

let conveyerEnabled = true;
let conveyerLength = 0;
let conveyerMaxLength = 0;
let conveyerConverted = 0;

const { photo: { status } } = constants;

const sourceDir = path.join(config.storePath, 'private/photos/');
const publicDir = path.join(config.storePath, 'public/photos/');
const protectedDir = path.join(config.storePath, 'protected/photos/');
const coveredDir = path.join(config.storePath, 'publicCovered/photos/');
const waterDir = path.join(__dirname, '/../misc/watermark/');
const waterFontPath = path.normalize(waterDir + 'AdobeFanHeitiStd-Bold.otf');

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
        water: true,
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
        water: true,
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
        postfix: '^',
    },
    m: {
        parent: 'h',
        desc: 'Midi',
        dir: 'm/',
        width: 150,
        height: 100,
        filter: 'Sinc',
        gravity: 'Center',
        postfix: '^',
    },
    q: {
        parent: 'm',
        desc: 'Mini',
        dir: 'q/',
        width: 90,
        height: 60,
        gravity: 'Center',
        postfix: '^',
    },
    s: {
        parent: 'm',
        desc: 'Micro',
        dir: 's/',
        width: 60,
        height: 60,
        gravity: 'Center',
        postfix: '^',
        // crop: true // Crop занимает больше места чем ресайз http://www.imagemagick.org/discourse-server/viewtopic.php?f=1&t=20415
    },
    x: {
        parent: 's',
        desc: 'Micros',
        dir: 'x/',
        width: 40,
        height: 40,
        gravity: 'Center',
        postfix: '^',
    },
};
const imageVersionsPriority = fillImgPrior(sourceDir, 0);
export const imageVersionsKeys = Object.keys(imageVersionsPriority).sort((a, b) => imageVersionsPriority[a] - imageVersionsPriority[b]);

const waterMarkGen = (function () {
    const logo = path.normalize(waterDir + 'logo.png');
    const base = {
        height: 600,
        pointsize: 12,
        splice: 14,
        logo: 12,
        indent_logo_l: 2,
        indent_logo_r: 3,
        indent_label_b: 1,
    };

    return function (options) {
        let multiplier = 1;
        let params = base;

        if (options.h > base.height) {
            multiplier = options.h / base.height;
            params = _.mapValues(params, n => Math.round(n * multiplier));
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
                '-gravity South',
                '-background \'#555555\'', // #285991
                `-splice 0x${params.splice}`,
                '-gravity Southwest',
                `-font ${waterFontPath}`,
                `-pointsize ${params.pointsize}`,
                '-stroke none',
                '-fill \'#f2f2f2\'',
                `-annotate ${textPosition} '${options.txt}'`,
                `\\( ${logo} -resize ${params.logo} \\)`,
                `-geometry +${params.indent_logo_l}+${Math.floor(offset)}`,
                '-composite',
            ],
        };
    };
}());

const protectCoverGen = function (options) {
    let blurSigma;

    if (options.h < 50) {
        blurSigma = 0;
    } else if (options.h < 100) {
        blurSigma = 1;
    } else if (options.h < 200) {
        blurSigma = 2;
    } else if (options.h < 600) {
        blurSigma = 3;
    } else {
        blurSigma = Math.min(10, Math.floor(options.h / 150)) + 1;
    }

    return [
        '-gravity center',
        `-blur 0x${blurSigma}`,
        '-background \'#0008\'',
        '-stroke none',
        '-fill \'#f2f2f2\'',
        `-font ${waterFontPath}`,
        `-size ${options.w}x${options.h}`,
        'caption:\'Not available\'',
        '-composite',
    ];
};

function fillImgPrior(parent, level) {
    return _.transform(imageVersions, (result, item, key) => {
        if (item.parent === parent) {
            result[key] = level;
            Object.assign(result, fillImgPrior(key, level + 1));
        }
    });
}

// Собираем статистику конвейера на начало каждой 10-минутки
function CollectConveyerStat() {
    const st = new STPhotoConveyer({
        stamp: new Date(+moment.utc().startOf('minute')),
        clength: conveyerMaxLength,
        converted: conveyerConverted,
    });

    st.save(err => {
        if (err) {
            logger.error('STPhotoConveyer error.\n ' + err);
        }
    });

    conveyerMaxLength = conveyerLength;
    conveyerConverted = 0;
    setTimeout(CollectConveyerStat, ms('10m'));
}

// Clear conveyor except photos, which are converting now
async function conveyerClear({ value }) {
    let removedCount = 0;

    if (value === true) {
        conveyerEnabled = value;

        ({ n: removedCount = 0 } = await PhotoConveyer.deleteMany({ converting: { $exists: false } }).exec());
    }

    conveyerLength = await PhotoConveyer.estimatedDocumentCount().exec();

    return { message: `Cleared ok! Removed ${removedCount}, left ${conveyerLength}` };
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
        .exec();

    goingToWork -= toWork - files.length;

    if (!files.length) {
        return;
    }

    for (const photoConv of files) {
        goingToWork -= 1;
        working += 1;

        const photo = await Photo
            .findOne({ cid: photoConv.cid }, {
                cid: 1, s: 1, user: 1,
                path: 1, file: 1, mime: 1,
                w: 1, h: 1, ws: 1, hs: 1,
                conv: 1, convqueue: 1, watersignText: 1,
            })
            .populate({ path: 'user', select: { _id: 0, login: 1 } })
            .exec();

        photo.conv = true;
        photoConv.converting = true;
        await Promise.all([photo.save(), photoConv.save()]);

        try {
            await conveyorStep(photo, photoConv);
            conveyerConverted += 1;
        } catch (err) {
            const errorObject = { cid: photoConv.cid, added: photoConv.added, error: String(err && err.message) };

            logger.error(errorObject);
            await new PhotoConveyerError(errorObject).save();
        }

        photo.conv = undefined; // Set undefined to remove properties
        photo.convqueue = undefined;
        photo.converted = new Date(); // Save last converted stamp
        await Promise.all([photo.save(), photoConv.deleteOne()]);

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
 * Another step of the conveyor
 * @param photo Photo object
 */
async function conveyorStep(photo, { protect: onlyProtectPublic = false, webpOnly = false }) {
    let itsPublicPhoto = photo.s === status.PUBLIC;
    const wasPublished = photo.s >= status.PUBLIC;
    const waterTxt = getWatertext(photo);
    const { cid } = photo;

    if (!webpOnly) {
        // Launch identification of original
        const originSrcPath = path.join(sourceDir, photo.path);

        await tryPromise(5, () => identifyImage(originSrcPath, originIdentifyString), `identify origin of photo ${cid}`)
            .then(result => {
                photo.w = parseInt(result.w, 10) || undefined;
                photo.h = parseInt(result.h, 10) || undefined;
                photo.format = result.f || undefined;
                photo.sign = result.signature || undefined;
            });
    }

    // We always convert to public (or covered) folder, if file was published once
    if (wasPublished) {
        await conveyorSubStep(photo, {
            webpOnly,
            waterTxt,
            protectCover: !itsPublicPhoto || onlyProtectPublic,
        });

        // Check again that photo is public to avoid race condition if photo's status was changed during conveyorSubStep
        const photoForCurrentStatus = await Photo.findOne({ cid: photo.cid }, { s: 1 }).exec();

        itsPublicPhoto = photoForCurrentStatus.s === status.PUBLIC;

        // If photo is not public anymore, try to delete its files from public folder
        if (!itsPublicPhoto) {
            await deletePhotoFiles({ photo });
        }
    }

    // And we also convert to protected folder if photo is not public
    // and there is no flag that we must just cover public with with protection curtain
    // (we specify this flag when deactivate photo, in this case we just copy public to protected to avoid extra convert)
    if (!itsPublicPhoto && !onlyProtectPublic) {
        await conveyorSubStep(photo, {
            webpOnly, waterTxt,
            isPublic: false,
            getStandardAttributes: !wasPublished, // Get attributes only if they hasn't been taken on public step
        });
    }
}

async function conveyorSubStep(photo, { isPublic = true, protectCover = false, webpOnly = false, getStandardAttributes = true, waterTxt }) {
    const { cid } = photo;
    const lossless = photo.mime === 'image/png';
    const targetDir = isPublic ? protectCover ? coveredDir : publicDir : protectedDir;

    const makeWebp = (variantName, dstPath) => {
        // WebP size limit
        if (photo.w > 16383 || photo.h > 16383) {
            return;
        }

        return tryPromise(5,
            () => execAsync(`cwebp -preset photo -m 5 ${lossless ? '-lossless ' : ''}${dstPath} -o ${dstPath}.webp`),
            `convert ${variantName}-variant to webp of photo ${cid}`
        ).catch(() => {
            logger.warn(`Webp variant of ${cid} could not be created, skipping`);
        });
    };

    for (const variantName of imageVersionsKeys) {
        const isFullsize = variantName === 'a';
        const isStandardsize = variantName === 'd';
        const variant = imageVersions[variantName];
        const srcDir = protectCover || variant.parent === sourceDir ? sourceDir : targetDir + imageVersions[variant.parent].dir;
        const srcPath = path.join(srcDir, photo.path);
        const dstDir = path.join(targetDir, variant.dir, photo.path.substr(0, 5));
        const dstPath = path.join(targetDir, variant.dir, photo.path);

        if (webpOnly) {
            await makeWebp(variantName, dstPath);
            continue;
        }

        const commands = [`convert ${srcPath}`];

        if (variant.strip) {
            commands.push('-strip');
        }

        if (variant.filter) {
            commands.push(`-filter ${variant.filter}`);
        }

        if (variant.quality) {
            commands.push(`-quality ${variant.quality}`);
        }

        await makeDir(dstDir);

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

        if (protectCover && !variant.water) {
            commands.push(...protectCoverGen({ w: variant.width, h: variant.height }));
        }

        commands.push(dstPath);

        // Convert photo. For full size ('a') we need straight convert with watermark, because we know origin size
        if (!isFullsize) {
            // console.log(variantName, commands.join(' '));
            await tryPromise(5,
                () => execAsync(commands.join(' ')), `convert to ${variantName}-variant of photo ${cid}`
            );
        }

        // For standard photo we must get result size before creating watermark, because it depends on those sizes
        if (isStandardsize && getStandardAttributes) {
            await tryPromise(6,
                () => identifyImage(dstPath, '{"w": "%w", "h": "%h"}'), `identify standard size of photo ${cid}`
            ).then(result => {
                photo.ws = parseInt(result.w, 10) || undefined;
                photo.hs = parseInt(result.h, 10) || undefined;
            });
        }

        if (variant.water) {
            const watermark = waterMarkGen({
                w: isFullsize ? photo.w : photo.ws,
                h: isFullsize ? photo.h : photo.hs,
                txt: waterTxt,
            });

            commands.pop();

            if (protectCover) {
                const protectCommands = protectCoverGen({
                    w: isFullsize ? photo.w : photo.ws,
                    h: isFullsize ? photo.h : photo.hs,
                });

                commands.push(...protectCommands);
            }

            commands.push(...watermark.commands);
            commands.push(dstPath);
            // console.log(variantName, commands.join(' '));
            await tryPromise(5,
                () => execAsync(commands.join(' ')), `convert to ${variantName}-variant of photo ${cid}`
            );

            if (photo.watersignText && getStandardAttributes) {
                photo.watersignTextApplied = new Date();
            }

            photo[isFullsize ? 'waterh' : 'waterhs'] = watermark.params.splice;

            if (isStandardsize && getStandardAttributes) {
                photo.hs -= watermark.params.splice;
            }
        }

        // We must know signature of result photo, to use it for resetting user's browser cache
        if (isStandardsize && getStandardAttributes) {
            const { signature, fileParam } = await getFileSign(photo, dstPath);

            photo.signs = signature || undefined;
            photo.file = `${photo.path}${fileParam}`;
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

            return tryPromise(attemps, promiseGenerator, data, attemp + 1);
        }

        logger.error(
            `After ${attemps} attemps promise execution considered failed. ${data || ''}
            ${err}`
        );

        throw new ApplicationError({ code: constantsError.CONVERT_PROMISE_GENERATOR, stack: false });
    }
}

async function getFileSign(photo, filePath) {
    const { signature } = await tryPromise(6,
        () => identifyImage(filePath, '{"signature": "%#"}'),
        `identify sign of ${filePath} of photo ${photo.cid}`
    );
    const fileParam = signature ? `?s=${signature.substr(0, 7)}${signature.substr(signature.length - 3)}` : '';

    return { signature, fileParam };
}

// Move photo's files between public/protected folders
export async function movePhotoFiles({ photo, copy = false, toProtected = false }) {
    const { path: filePath } = photo;
    const fileWebp = filePath + '.webp';
    const fileDir = filePath.substr(0, 5);

    const method = copy ? Utils.copyFile : fsAsync.rename.bind(fsAsync);
    const sourceDir = toProtected ? publicDir : protectedDir;
    const targetDir = toProtected ? protectedDir : publicDir;

    await Promise.all(imageVersionsKeys.map(async key => {
        const source = path.join(sourceDir, key);
        const target = path.join(targetDir, key);

        await makeDir(path.join(target, fileDir));

        return Promise.all([
            method(path.join(source, filePath), path.join(target, filePath)),
            method(path.join(source, fileWebp), path.join(target, fileWebp)),
        ]);
    }));

    // If we copy/move files to public folder, we must get signature again and fill anticache param in file property
    if (!toProtected) {
        await sleep(50);

        const { signature, fileParam } = await getFileSign(photo, path.join(targetDir, 'd', filePath));

        await Photo.updateOne(
            { cid: photo.cid }, { $set: { file: filePath + fileParam, signs: signature || '', converted: new Date() } }
        ).exec();
    }
}

// Delete photo files from public/protected folders, silently, swallowing possible errors if file does not exist
export function deletePhotoFiles({ photo, fromProtected = false, fromCovered = false }) {
    const { path: filePath } = photo;
    const fileWebp = filePath + '.webp';

    const dir = fromProtected ? protectedDir : fromCovered ? coveredDir : publicDir;

    return Promise.all(imageVersionsKeys.map(key => Promise.all([
        fsAsync.unlink(path.join(dir, key, filePath)).catch(_.noop),
        fsAsync.unlink(path.join(dir, key, fileWebp)).catch(_.noop),
    ])));
}

/**
 * Method for add photos to the conveyer
 * @param data Array of objects like {cid: 123}
 * @param priority Priority of convertation in conveyer
 */
export async function addPhotos(data, priority, potectPublicOnly) {
    const toConvertObjs = [];
    const stamp = new Date();

    for (const photo of data) {
        const cid = Number(photo.cid);

        if (cid > 0) {
            toConvertObjs.push({ cid, priority: priority || 4, added: stamp, protect: potectPublicOnly });
        }
    }

    if (toConvertObjs.length) {
        await PhotoConveyer.collection.insert(toConvertObjs, { safe: true });

        conveyerLength += toConvertObjs.length;
        conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);

        conveyerControl();
    }

    return {
        message: (toConvertObjs.length === 1 ? 'Фотография отправлена' : `${toConvertObjs.length} фотографии отправлено`) +
        ' на конвертацию',
    };
}

/**
 * Добавление в конвейер конвертации всех фотографий
 * @param params Объект
 */
export async function addPhotosAll(params) {
    const result = await dbEval('convertPhotosAll', [params], { nolock: true });

    if (result && result.error) {
        throw new ApplicationError({ code: constantsError.CONVERT_PHOTOS_ALL, result });
    }

    conveyerLength += result.conveyorAdded;
    conveyerMaxLength = Math.max(conveyerLength, conveyerMaxLength);
    conveyerControl();

    return result;
}

/**
 * Remove photos from conveyor
 * @param cids Array of cids
 */
export async function removePhotos(cids) {
    if (_.isEmpty(cids)) {
        return 0;
    }

    const { n: removedCount = 0 } = await PhotoConveyer.deleteMany({ cid: { $in: cids } }).exec();

    conveyerLength -= removedCount;

    return removedCount;
}

(async function converterStarter() {
    await waitDb;

    // Запускаем конвейер после рестарта сервера, устанавливаем все недоконвертированные фото обратно в false
    setTimeout(async () => {
        try {
            await PhotoConveyer.updateMany(
                { converting: { $exists: true } }, { $unset: { converting: 1 } }
            ).exec();
        } catch (err) {
            return logger.error(err);
        }

        conveyerControl();
    }, 4000);

    const count = await PhotoConveyer.estimatedDocumentCount().exec();

    conveyerLength = Math.max(count, conveyerMaxLength);
    conveyerMaxLength = conveyerLength;

    // Планируем запись статистики конвейера на начало следующей 10-минутки
    const hourStart = +moment.utc().startOf('hour');

    setTimeout(CollectConveyerStat, hourStart + ms('10m') * Math.ceil((Date.now() - hourStart) / ms('10m')) - Date.now() + 10);
}());

function conveyorStartStop({ value }) {
    if (_.isBoolean(value)) {
        conveyerEnabled = value;

        if (value) {
            conveyerControl();
        }
    }

    return { conveyerEnabled };
}

async function conveyorStat() {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    const halfYear = Date.now() - ms('0.5y');
    const docs = await STPhotoConveyer.find({ stamp: { $gt: halfYear } }, { _id: 0, __v: 0 }, {
        sort: 'stamp',
        lean: true,
    }).exec();

    docs.forEach(doc => doc.stamp = doc.stamp.getTime());

    return { data: docs };
}

const conveyorStatFast = () => ({
    conveyerEnabled,
    conveyerLength,
    conveyerMaxLength,
    conveyerConverted,
});

conveyorStartStop.isPublic = true;
conveyerClear.isPublic = true;
conveyorStat.isPublic = true;
conveyorStatFast.isPublic = true;

export default {
    conveyorStartStop,
    conveyerClear,
    conveyorStat,
    conveyorStatFast,
};

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

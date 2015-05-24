import { exec } from 'child_process';
import { default as path } from 'path';
import { default as Bluebird } from 'bluebird';
import { default as log4js } from 'log4js';
import { default as _ } from 'lodash';
import { default as gm } from 'gm';
import { default as mkdirp } from 'mkdirp';
import { default as moment } from 'moment';
import { default as ms } from 'ms';

var mkdirpAsync = Bluebird.promisify(mkdirp);
var execAsync = Bluebird.promisify(exec);
var dbNative;
var dbEval;
var User;
var Photo;
var PhotoConveyer;
var PhotoConveyerError;
var STPhotoConveyer;
var logger = log4js.getLogger('photoConverter.js');
var appEnv = {};

var conveyerEnabled = true;
var conveyerLength = 0;
var conveyerMaxLength = 0;
var conveyerConverted = 0;

var sourceDir = global.appVar.storePath + 'private/photos/';
var targetDir = global.appVar.storePath + 'public/photos/';
var waterDir = __dirname + '/../misc/watermark/';

var maxWorking = 6; // Возможно параллельно конвертировать
var goingToWork = 0; // Происходит выборка для дальнейшей конвертации
var working = 0; //Сейчас конвертируется

var imageVersions = {
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
        gravity: function (w, h, w2, h2) {
            var result = { gravity: 'Center', extent: { w: w2, h: h2 } };
            var aspect = w / h;
            var newH; // Высота после пропорционального уменьшения ширины

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
        //crop: true // Crop занимает больше места чем ресайз http://www.imagemagick.org/discourse-server/viewtopic.php?f=1&t=20415
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
var imageVersionsPriority = fillImgPrior(sourceDir, 0);
var imageVersionsKeys = Object.keys(imageVersionsPriority).sort((a, b) => (imageVersionsPriority[a] - imageVersionsPriority[b]));

var waterMarkGen = (function () {
    var waterFontPath = path.normalize(waterDir + 'AdobeFanHeitiStd-Bold.otf');
    var logo = path.normalize(waterDir + 'logo.png');
    var base = {
        height: 600,
        pointsize: 13,
        splice: 18,
        logo: 14,
        indent_logo_l: 2,
        indent_logo_r: 3,
        indent_label_b: 3
    };

    return function (options) {
        var multiplier = 1;
        var params = base;

        if (options.h > base.height) {
            multiplier = options.h / base.height;
            params = _.mapValues(params, function (n) {
                return Math.round(n * multiplier);
            });
        }

        var textPosition = `+${Math.round(params.indent_logo_l + params.logo + params.indent_logo_r)}+${params.indent_label_b}`;

        return {
            params: params,
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
                `-geometry +${params.indent_logo_l}+${(params.splice - params.pointsize) / 2}`,
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
    var st = new STPhotoConveyer({
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
    var removed = 0;
    try {
        removed = (await PhotoConveyer.removeAsync({ converting: { $exists: false } }))[0];
    } catch (err) {
        return { message: err || 'Error occurred', error: true };
    }
    conveyerLength = await PhotoConveyer.countAsync({});
    return { message: `Cleared ok! Removed ${removed}, left ${conveyerLength}` };
}

/**
 * Контроллер конвейера. Выбирает очередное фото из очереди и вызывает шаг конвейера
 */
async function conveyerControl() {
    var toWork = maxWorking - goingToWork - working;

    if (!conveyerEnabled || toWork < 1) {
        return;
    }
    goingToWork += toWork;

    var files = await PhotoConveyer.find({ converting: { $exists: false } })
        .sort({ priority: 1, added: 1 })
        .limit(toWork)
        .execAsync();

    goingToWork -= toWork - files.length;

    if (!files.length) {
        return;
    }

    for (let photoConv of files) {
        goingToWork -= 1;
        working += 1;

        let photo = await Photo
            .findOne({ cid: photoConv.cid }, { cid: 1, file: 1, user: 1, w: 1, h: 1, ws: 1, hs: 1, conv: 1, convqueue: 1 })
            .populate({ path: 'user', select: { _id: 0, login: 1 } })
            .execAsync();

        photo.conv = true;
        photoConv.converting = true;
        await * [photo.saveAsync(), photoConv.saveAsync()];

        try {
            await conveyerStep(photo);
            conveyerConverted += 1;
        } catch (err) {
            let errorObject = { cid: photoConv.cid, added: photoConv.added, error: String(err && err.message) };
            logger.error(errorObject);
            await new PhotoConveyerError(errorObject).saveAsync();
        }

        photo.conv = undefined; // Присваиваем undefined, чтобы удалить свойства
        photo.convqueue = undefined;
        await * [photo.saveAsync(), photoConv.removeAsync()];

        working -= 1;
        if (conveyerLength) {
            conveyerLength -= 1;
        }
        conveyerControl();
    }
}

var identifyImage = (src, format) =>
    new Bluebird((resolve, reject) => gm(src).identify(format, (err, result) => {
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

var writeImage = (dst, gmInstance) =>
    new Bluebird((resolve, reject) => gmInstance.write(dst, (err, result) => err ? reject(err) : resolve(result)));

var sleep = time => new Bluebird(resolve => setTimeout(resolve, time));

/**
 * Очередной шаг конвейера
 * @param photo Объект фотографии
 */
async function conveyerStep(photo) {
    var waterTxt = `pastvu.com/p/${photo.cid}  uploaded by ${photo.user.login}`;
    var originSrcPath = path.normalize(sourceDir + photo.file);
    var saveStandartSize = function (result) {
        photo.ws = parseInt(result.w, 10) || undefined;
        photo.hs = parseInt(result.h, 10) || undefined;
    };

    // Запускаем identify оригинала
    await tryPromise(5, () => identifyImage(originSrcPath, '{"w": "%w", "h": "%h", "f": "%C", "signature": "%#"}'), `identify origin of photo ${photo.cid}`)
        .then(function (result) {
            photo.w = parseInt(result.w, 10) || undefined;
            photo.h = parseInt(result.h, 10) || undefined;
            photo.format = result.f || undefined;
            photo.sign = result.signature || undefined;
        });

    for (let variantName of imageVersionsKeys) {
        let original = variantName === 'a';
        let variant = imageVersions[variantName];
        let srcDir = variant.parent === sourceDir ? sourceDir : targetDir + imageVersions[variant.parent].dir;
        let srcPath = path.normalize(srcDir + photo.file);
        let dstDir = path.normalize(targetDir + variant.dir + photo.file.substr(0, 5));
        let dstPath = path.normalize(targetDir + variant.dir + photo.file);

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
                    // Превью генерируем путем вырезания аспекта из центра
                    // Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
                    let gravity = _.isFunction(variant.gravity) ?
                        variant.gravity(photo.w, photo.h, variant.width, variant.height) : { gravity: variant.gravity };
                    let extent = _.isObject(gravity) && gravity.extent ?
                        gravity.extent : { w: variant.width, h: variant.height };

                    commands.push(`-gravity ${gravity.gravity}`);
                    commands.push(`-extent '${extent.w}x${extent.h}${extent.options || ''}'`);
                }
            }
        }

        if (variant.water) {
            let watermark = waterMarkGen({
                w: original ? photo.w : photo.ws,
                h: original ? photo.h : photo.hs,
                txt: waterTxt
            });

            commands = commands.concat(watermark.commands);
            photo[original ? 'waterh' : 'waterhs'] = watermark.params.splice;
        }

        commands.push(dstPath);
        //console.log(variantName, commands.join(' '));
        await tryPromise(5, () => execAsync(commands.join(' ')), `convert to ${variantName}-variant of photo ${photo.cid}`);

        if (variantName === 'd') {
            await tryPromise(6, () => identifyImage(dstPath, '{"w": "%w", "h": "%h"}'), `identify ${variantName}-variant of photo ${photo.cid}`)
                .then(saveStandartSize);
        }

        // Have a sleep to give file system time to save variant, for staying on the safe side
        await sleep(50);
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
 * Добавление в конвейер конвертации фотографий
 * @param data Массив объектов {cid: 123}
 */
export async function addPhotos(data, priority) {
    var cid;
    var toConvertObjs = [];
    var stamp = new Date();

    for (let photo of data) {
        cid = Number(photo.cid);

        if (cid > 0) {
            toConvertObjs.push({ cid: cid, priority: priority || 4, added: stamp });
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
 * @param data Объект
 */
export async function addPhotosAll(params) {
    var result = await dbEval('function (params) {return convertPhotosAll(params);}', [params], { nolock: true });

    if (result && result.error) {
        throw { message: result.message || '' };
    }

    conveyerLength += result.photosAdded;
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
    appEnv = app.get('appEnv');

    dbNative = db.db;
    /* jshint evil:true */
    dbEval = Bluebird.promisify(dbNative.eval, dbNative);
    /* jshint evil:false */

    Photo = db.model('Photo');
    PhotoConveyer = db.model('PhotoConveyer');
    PhotoConveyerError = db.model('PhotoConveyerError');
    STPhotoConveyer = db.model('STPhotoConveyer');
    User = db.model('User');

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
        conveyerLength = Math.max(count, conveyerMaxLength);
        conveyerMaxLength = conveyerLength;
    });

    // Планируем запись статистики конвейера на начало следующей 10-минутки
    var hourStart = +(moment().utc().startOf('hour'));
    setTimeout(CollectConveyerStat, hourStart + ms('10m') * Math.ceil((Date.now() - hourStart) / ms('10m')) - Date.now() + 10);

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;


        (function () {
            socket.on('conveyerStartStop', function (value) {
                if (_.isBoolean(value)) {
                    conveyerEnabled = value;
                    if (value) {
                        conveyerControl();
                    }
                }
                socket.emit('conveyerStartStopResult', {
                    conveyerEnabled: conveyerEnabled
                });
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

            socket.on('statConveyer', function () {
                if (!hs.usObj.registered) {
                    result({ message: 'Not authorized for statConveyer', error: true });
                    return;
                }
                STPhotoConveyer.collection.find({}, { _id: 0, __v: 0 }, { sort: 'stamp' }, function (err, docs) {
                    docs.toArray(function (err, docs) {
                        var i = docs.length;
                        while (i--) {
                            docs[i].stamp = docs[i].stamp.getTime();
                        }
                        result({ data: docs });
                    });

                });
            });
        }());

        (function statFast() {
            socket.on('giveStatFastConveyer', function () {
                socket.emit('takeStatFastConveyer', {
                    conveyerEnabled: conveyerEnabled,
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
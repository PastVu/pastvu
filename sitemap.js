import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import zlib from 'zlib';
import log4js from 'log4js';
import mkdirp from 'mkdirp';
import config from './config';
import { times, hhmmssms } from './commons/time';
import { ready as regionsReady, getObjRegionList, getRegionsPublic } from './controllers/region';

import connectDb from './controllers/connection';
import './models/_initValues';
import { Photo } from './models/Photo';

const logger = log4js.getLogger('sitemap');
const { sitemapPath, sitemapInterval, sitemapGenerateOnStart, client: { origin } } = config;
const sitemapPathAbs = path.resolve(sitemapPath);

// Scheduler of next generations
const schedule = (function () {
    async function run() {
        const start = Date.now();

        logger.info(`Starting to generate sitemap`);
        const totalPhotos = await generateSitemap();
        logger.info(`Done in ${(Date.now() - start) / 1000}s, ${totalPhotos} photos have been added to to sitemap`);

        schedule();
    }

    return (immediate) => {
        let timeout;

        if (immediate) {
            timeout = 4;
        } else {
            // Next run must be next interval after last midnight
            const a = (Date.now() - times.midnight) / sitemapInterval;
            timeout = Math.ceil(
                a > 1 ? sitemapInterval - sitemapInterval * (a - Math.floor(a)) : sitemapInterval - sitemapInterval * a
            );
        }

        const next = new Date(Date.now() + timeout);
        logger.info(
            `Next sitemap generation has been scheduled on ` +
            `${next.getFullYear()}-${next.getMonth() + 1}-${next.getDate()} ${hhmmssms(next)}`
        );

        setTimeout(run, timeout);
    };
}());

export async function configure(startStamp) {
    mkdirp.sync(sitemapPathAbs);

    await connectDb(config.mongo.connection, config.mongo.pool, logger);
    await regionsReady;

    logger.info(`Sitemap generator started up in ${(Date.now() - startStamp) / 1000}s`);

    schedule(sitemapGenerateOnStart);
}

const processPhotos = photos => photos.reduce((result, { cid, file, title, adate, cdate, ucdate, ...regions }) => {
    const changed = ucdate || cdate || adate;

    // If photo has regions and it's not Open see, fill geo_location attribute
    const geoLocation = regions.r0 > 0 && regions.r0 !== 1000000 ? getRegionsString(regions) : '';

    return result + `<url>
            <loc>${origin}/p/${cid}</loc>
            <lastmod>${changed.toISOString()}</lastmod>
            <changefreq>daily</changefreq>
            <priority>0.8</priority>
            <image:image>
                <image:loc>${origin}/_p/a/${file}</image:loc>
                <image:title>${_.escape(title)}</image:title>${geoLocation}
            </image:image>
        </url>`;
}, '');

const processRegions = regions => regions.reduce((result, { cid }) => {
    return result + `<url>
            <loc>${origin}/ps?f=r!${cid}</loc>
            <changefreq>daily</changefreq>
            <priority>0.7</priority>
        </url>`;
}, '');

async function generateSitemap() {
    const stamp = new Date().toISOString();

    let sitemapIndex = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    let start;
    let counter = 1;
    let totalPhotos = 0;
    let fileName = `sitemap${counter}.xml.gz`;

    for (let cid = 1, count = 0; cid !== undefined; counter++) {
        start = Date.now();
        fileName = path.join(sitemapPathAbs, `sitemap${counter}.xml.gz`);

        [cid, count] = await generatePhotoSitemap(fileName, cid, 50000);

        if (cid) {
            totalPhotos += count;
            sitemapIndex += `<sitemap><loc>${origin}/${fileName}</loc><lastmod>${stamp}</lastmod></sitemap>`;
            logger.info(
                `${fileName} generated in ${(Date.now() - start) / 1000}s for ${count} photos, last photo id is ${cid}`
            );
        }
    }

    counter--;
    start = Date.now();
    fileName = path.join(sitemapPathAbs, `sitemap${counter}.xml.gz`);
    const regionsCount = await generateRegionsSitemap(fileName);

    if (regionsCount) {
        sitemapIndex += `<sitemap><loc>${origin}/${fileName}</loc><lastmod>${stamp}</lastmod></sitemap>`;
        logger.info(
            `${fileName} generated in ${(Date.now() - start) / 1000}s for ${regionsCount} regions`
        );
    }

    sitemapIndex += '</sitemapindex>';

    fs.writeFileSync(path.join(sitemapPathAbs, 'sitemap.xml'), sitemapIndex, { encoding: 'utf8' });

    return totalPhotos;
}

async function generatePhotoSitemap(fileName, cidFrom, limit) {
    const photos = await Photo.find(
        { s: 5, cid: { $gt: cidFrom } },
        {
            _id: 0, cid: 1, file: 1, title: 1,
            adate: 1, cdate: 1, ucdate: 1, r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1
        },
        { lean: true, limit, sort: { cid: 1 } }
    ).exec();

    let string = processPhotos(photos);

    if (_.isEmpty(string)) {
        return Promise.resolve([]);
    }

    string = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
        string + '</urlset>';

    string = string.replace(/^[\t\s]+/gim, '').replace(/\r|\n/gim, '');

    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(fileName);

    gzip.pipe(out);
    gzip.write(string);
    gzip.end();

    return new Promise((resolve, reject) => {
        out.on('finish', () => resolve([_.chain(photos).last().get('cid').value(), photos.length]));
        out.on('error', err => reject(err));
    });
}

async function generateRegionsSitemap(fileName) {
    const { regions } = await getRegionsPublic();

    let string = processRegions(regions);

    if (_.isEmpty(string)) {
        return Promise.resolve(0);
    }

    string = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
        string + '</urlset>';

    string = string.replace(/^[\t\s]+/gim, '').replace(/\r|\n/gim, '');

    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(fileName);

    gzip.pipe(out);
    gzip.write(string);
    gzip.end();

    return new Promise((resolve, reject) => {
        out.on('finish', () => resolve(regions.length));
        out.on('error', err => reject(err));
    });
}

function getRegionsString(regions) {
    // For Russia regions take local name
    const regionField = regions.r0 === 1 ? 'title_local' : 'title_en';
    const titles = _.pluck(getObjRegionList(regions, ['title_en', 'title_local']), regionField);

    if (!titles.length) {
        return '';
    }

    return `<image:geo_location>${titles.reverse().join(', ')}</image:geo_location>`;
}
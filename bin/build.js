#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

require('./run');

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const babel = require('@babel/core');
const pug = require('pug');
const { buildAssets } = require('./build-assets');
const Utils = require('../commons/Utils');
const babelConfig = require('../babel/server.config');
const { values: { env } } = parseArgs({
    options: { env: { type: 'string', default: 'production' } },
});
const targetDir = path.resolve('appBuild');
const hash = Utils.randomString(5);
const config = { env, hash };
const copyPatterns = [
    'app/**', 'bin/**', 'migrations/**', 'commons/**', 'misc/watermark/**',
    'controllers/systemjs.js', 'package-lock.json',
    'config/@(client|server|log4js|migrate-mongo|default.config).js',
    'config/package.json',
    'views/app.pug', 'views/api/**', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**',
    'api.js', 'package.json', 'README',
];
const babelPatterns = [
    '@(app|downloader|uploader|sitemap|notifier|worker).js',
    'controllers/!(systemjs|api|apilog).js',
    'commons/Utils.js', 'models/*.js', 'app/*.js', 'app/webapi/*.js', 'app/errors/*.js',
];

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
}

function* files(patterns, cwd = '.') {
    for (const file of fs.globSync(patterns, { cwd })) {
        if (fs.statSync(path.join(cwd, file)).isFile()) {
            yield file;
        }
    }
}

async function build() {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.globSync(path.join(targetDir, '*'))) {
        fs.rmSync(entry, { recursive: true, force: true });
    }

    await buildAssets({ outdir: path.join(targetDir, 'public'), env, hash, minify: true });

    console.log('Copying and transpiling server files');

    for (const file of files(copyPatterns)) {
        const dest = path.join(targetDir, file);

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(file, dest);
    }

    for (const file of files(babelPatterns)) {
        const result = await babel.transformFileAsync(file, babelConfig);

        writeFile(path.join(targetDir, file), result.code + '\n');
    }

    // Static nginx error_page fallback; Express supplies the real i18n helper at runtime.
    const fallback = path.join(targetDir, 'views/status/404.pug');

    writeFile(path.join(targetDir, 'views/html/status/404.html'), pug.renderFile(fallback, {
        appName: '404', config, pretty: false, t: s => s,
    }));
    writeFile(path.join(targetDir, 'build.json'), JSON.stringify({ hash }));
    console.log(`Build complete. env: ${env}, hash: ${hash}`);
}

build().catch(err => {
    console.error(err);
    process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

require('./run');

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const babel = require('@babel/core');
const pug = require('pug');
const uglify = require('uglify-js');
const Utils = require('../commons/Utils');
const babelConfig = require('../babel/server.config');
const pkg = require('../package.json');
const { values: { env } } = parseArgs({
    options: { env: { type: 'string', default: 'production' } },
});
const targetDir = path.resolve('appBuild');
const hash = Utils.randomString(5);
const config = { env, hash };
const copyPatterns = [
    'app/**', 'bin/**', 'migrations/**', 'commons/**', 'misc/watermark/**',
    'controllers/systemjs.js', 'npm-shrinkwrap.json',
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

function minify(dest, sources, banner) {
    // Source names are relative to the map, which stays next to the output JS.
    const input = Object.fromEntries(sources.map(file => [
        path.relative(path.dirname(dest), file).split(path.sep).join('/'),
        fs.readFileSync(file, 'utf8'),
    ]));
    const result = uglify.minify(input, {
        compress: {},
        mangle: {},
        ie8: false,
        output: { comments: false, ...banner ? { preamble: banner } : {} },
        sourceMap: { filename: path.basename(dest), url: path.basename(dest) + '.map' },
    });

    if (result.error) {
        throw result.error;
    }

    writeFile(dest, result.code);
    writeFile(dest + '.map', result.map);
}

async function build() {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.globSync(path.join(targetDir, '*'))) {
        fs.rmSync(entry, { recursive: true, force: true });
    }

    console.log('Compiling module templates');

    for (const file of files('**/*.pug', 'views/module')) {
        writeFile(path.join('public/tpl', file), pug.renderFile(path.join('views/module', file), { config, pretty: false }));
    }

    // Keep the existing LESS and RequireJS pipeline in its own process.
    execFileSync(process.execPath, [path.join(__dirname, 'build-assets.js')], { stdio: 'inherit' });

    const configFile = 'public-build/js/_mainConfig.js';

    writeFile(configFile, fs.readFileSync(configFile, 'utf8').replace(/__=__/ig, `__=${hash}`));

    const date = new Date();
    const built = [date.getDate(), date.getMonth() + 1, date.getFullYear()].map(n => String(n).padStart(2, '0')).join('.');
    const banner = '/**\n' +
        ' * Hello, inquiring mind!\n' +
        ` * This is ${pkg.name} application of ${pkg.description}.\n` +
        ` * Explore its source code and contribute at ${pkg.homepage}\n` +
        ` * Version: ${pkg.version}, built ${built}\n` +
        ` * Author: ${pkg.author.name} <${pkg.author.email}>\n` +
        ' */\n';
    const apps = ['module/appMain.js', 'module/appAdmin.js'];

    console.log('Minifying JavaScript');

    for (const app of apps) {
        const dest = path.join('public-build/js', app);

        minify(dest, ['public-build/js/lib/require/require.js', configFile, dest], banner);
    }

    for (const file of files('**/*.js', 'public-build/js')) {
        if (!file.endsWith('.min.js') && !apps.includes(file.split(path.sep).join('/'))) {
            const dest = path.join('public-build/js', file);

            minify(dest, [dest]);
        }
    }

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

    fs.renameSync('public-build', path.join(targetDir, 'public'));

    // Static nginx error_page fallback; Express supplies the real i18n helper at runtime.
    const fallback = path.join(targetDir, 'views/status/404.pug');

    writeFile(path.join(targetDir, 'views/html/status/404.html'), pug.renderFile(fallback, {
        appName: '404', config, pretty: false, t: s => s,
    }));
    fs.rmSync('public/tpl', { recursive: true, force: true });
    writeFile(path.join(targetDir, 'build.json'), JSON.stringify({ hash }));
    console.log(`Build complete. env: ${env}, hash: ${hash}`);
}

build().catch(err => {
    console.error(err);
    process.exitCode = 1;
});

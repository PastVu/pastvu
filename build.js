#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

require('./bin/run');

const start = Date.now();
const fs = require('fs').promises;
const path = require('path');
const requirejs = require('requirejs');
const less = require('less');
const Utils = require('./commons/Utils');

const lessCompileOptions = {
    compress: true,
    silent: false,
    path: 'public/style/',
    color: true,
    strictImports: true,
};

const requireBuildConfig = {
    appDir: 'public/',
    baseUrl: 'js',
    dir: 'public-build',
    keepBuildDir: false,
    optimize: 'none', // We will minify the built files after the optimizer runs.
    normalizeDirDefines: 'all', // Make define() calls normalized correctly to withstand post hoc minification.
    skipDirOptimize: false, //Оптимизировать только модули (modules array), не трогая остальные js
    optimizeCss: 'none', //Не трогаем css
    preserveLicenseComments: false, //Удаляем лицензионные комментарии
    paths: {
        // i18next.min.js uses modern ES syntax (optional chaining, nullish coalescing)
        // that r.js's esprima parser can't handle. Mark it external so the optimizer
        // skips inlining it; the file is still copied via the `dir` option and
        // loaded at runtime per the path in public/js/_mainConfig.js.
        'i18next': 'empty:',
    },
    removeCombined: false, //Не удаляем файлы, которые заинлайнились в модуль
    inlineText: true, //Включать ли в модули контент, загруженный плагином text
    logLevel: 0,
    mainConfigFile: 'public/js/_mainConfig.js',
    modules: [
        {
            //Виртуальный модуль, содержащий общие модули, которые надо исключать из частных модулей
            name: 'commonExcludes',
            create: true, //set crecate: true if 'commonExcludes' is not a module that exists before a build
            include: [
                'domReady', 'text', 'css', 'lib/require/plugins/require-css/normalize',
                'jquery', 'underscore', 'knockout', 'knockout.mapping', 'lib/doT', 'moment',
                'noty', 'noty.layouts', 'noty.themes/pastvu',
                'Browser', 'Utils', 'socket', 'router', 'Params', 'globalVM',
                'm/_moduleCliche', 'renderer',
                'model/Photo', 'model/User', 'model/storage', 'intl',
            ],
        },

        {
            name: '_mainConfig', //Компилируем конфигурацию, чтобы включить туда общую зависимость 'lib/JSExtensions'
        },
        {
            name: 'module/appMain',
            include: [
                'socket.io', 'lib/doT',
                'm/common/auth', 'm/common/top', 'm/common/foot',
                'm/main/commentsFeed', 'm/main/mainPage', 'm/main/bottomPanel',
                'm/map/map', 'm/map/marker', 'm/map/navSlider',
                'm/photo/photo', 'm/photo/gallery',
                'm/diff/newsList', 'm/diff/news',
                'm/comment/comments',
                'm/user/brief', 'm/user/profile', 'm/user/userPage',
                'errors/Application', 'errors/Timeout',
            ],
            exclude: ['lib/require/plugins/require-css/normalize'], // normalize надо исключать, т.к. он почему-то попадает в сборку https://github.com/guybedford/require-css#basic-usage
        },
        {
            name: 'm/diff/about',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/comments',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/photoUpload',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/comment/hist',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/photo/hist',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/common/share',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/subscr',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/settings',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/user/sessions',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/user/session',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/user/manage',
            exclude: ['commonExcludes', 'bs/collapse'],
        },
        {
            name: 'm/region/select',
            exclude: ['commonExcludes'],
        },
        {
            name: 'm/common/reason',
            exclude: ['commonExcludes'],
        },
    ],
};
async function build() {
    // Ищем less-файлы для компиляции и создаем плоский массив
    const files = await walkFiles({
        dir: path.normalize('./' + requireBuildConfig.appDir + 'style'),
        excludeFolders: ['bs', 'fonts'],
    });
    const lessFiles = Utils.filesListProcess(files, requireBuildConfig.appDir + 'style/', '', element => element.includes('.less'));

    await lessCompile(lessFiles);

    console.log('~~~ Start r.js build ~~~');
    await new Promise((resolve, reject) => {
        requirejs.optimize(requireBuildConfig, resolve, reject);
    });
    console.dir('Require build finished');

    //Удаляем less из собранной директории
    console.dir('Removing Less from build');

    const buildFiles = await walkFiles({ dir: path.normalize(requireBuildConfig.dir + '/style') });
    const buildLessFiles = Utils.filesListProcess(buildFiles, null, '', element => element.includes('.less'));

    for (const file of buildLessFiles) {
        await fs.unlink(file);
    }

    console.dir('Build complete. Ok in ' + (Date.now() - start) / 1000 + 's');
    process.exit(0);
}

function walkFiles(options) {
    return new Promise((resolve, reject) => {
        Utils.walkParallel({ ...options, onDone: (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        } });
    });
}

async function lessCompile(files) {
    for (const input of files) {
        const data = await fs.readFile(lessCompileOptions.path + input, 'utf-8');

        console.dir('Compiling LESS ' + lessCompileOptions.path + input);

        const result = await less.render(data, {
            paths: [lessCompileOptions.path + path.dirname(input)],
            filename: path.basename(input),
            strictImports: lessCompileOptions.strictImports,
            compress: lessCompileOptions.compress,
        });

        if (result.css) {
            await fs.writeFile(lessCompileOptions.path + input.replace('.less', '.css'), result.css, 'utf8');
        }
    }
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});

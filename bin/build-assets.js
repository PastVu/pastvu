#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild-wasm');
const browserslistToEsbuild = require('browserslist-to-esbuild').default;
const babel = require('@babel/core');
const less = require('less');
const pug = require('pug');
const aliases = require('./frontend-paths');

const root = path.resolve('public/js');
const header = '/** Built from the PastVu frontend sources. See COPYING for license. */';

function resolveModule(id, importer = path.join(root, '_mainConfig.js')) {
    let aliased = false;

    for (const key of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
        if (id === key || id.startsWith(key + '/')) {
            id = aliases[key] + id.slice(key.length);
            aliased = true;
            break;
        }
    }

    const filename = path.resolve(!aliased && id.startsWith('.') ? path.dirname(importer) : root, id);

    return path.extname(filename) === '.js' ? filename : filename + '.js';
}

// Vendored UMD/AMD libraries retain their upstream sources. Statically import their
// declared dependencies at build time; the factory executes in an isolated scope.
// This is not a browser module registry or a runtime dependency resolver.
function vendorModule(source, filename) {
    const ast = babel.parseSync(source, { sourceType: 'script', configFile: false, babelrc: false });
    const deps = new Set();

    babel.traverse(ast, {
        CallExpression({ node }) {
            if (node.callee.name === 'define') {
                const array = node.arguments.find(arg => arg.type === 'ArrayExpression');

                for (const item of array?.elements || []) {
                    if (item.type !== 'StringLiteral') {
                        throw new Error('Non-static vendor dependency in ' + filename);
                    }

                    deps.add(item.value);
                }
            }
        },
    });

    // Browser-only plugins depend on globals; imports enforce execution order.
    if (!deps.size && !source.includes('define(')) {
        if (/jquery|bootstrap|trumbowyg|highstock/.test(filename)) {
            deps.add('jquery');
        }

        if (filename.includes('/trumbowyg/plugins/') || filename.includes('/trumbowyg/langs/')) {
            deps.add('trumbowyg');
        }

        if (filename.includes('resizimg')) {
            deps.add('jquery-plugins/jquery-resizable.min');
        }

        if (filename.includes('/leaflet/plugins/')) {
            deps.add('leaflet');
        }

        if (filename.includes('tokenfield')) {
            deps.add('jquery-plugins/typeahead.bundle');
        }
    }

    const imports = [...deps].filter(id => !['exports', 'module', 'require'].includes(id));
    const bindings = imports.map((id, index) => `import dep${index} from ${JSON.stringify(id.startsWith('css!') ? id.slice(4) + '.css' : resolveModule(id, filename))};`).join('\n');
    const values = imports.map((id, index) => `${JSON.stringify(id)}: dep${index}`).join(',');

    return `${bindings}
const vendorExports = {};
const dependencies = {${values}${values ? "," : ""} exports: vendorExports};
let result;
function register(...args) {
    const factory = args.pop();
    const ids = Array.isArray(args[args.length - 1]) ? args.pop() : [];
    result = typeof factory === 'function' ? factory(...ids.map(id => dependencies[id])) : factory;
}
register.amd = {};
(function(define, module, exports) {
${source}
}).call(window, register, undefined, undefined);
export default result === undefined ? ${filename.includes('/highstock/') ? 'window.Highcharts' : 'vendorExports'} : result;
`;
}

async function buildAssets({ outdir = 'public-build', hash = 'development', minify = true, env = minify ? 'production' : 'development' } = {}) {
    await fs.rm(outdir, { recursive: true, force: true });
    await fs.cp('public', outdir, {
        recursive: true,
        filter: source => !source.startsWith(path.join('public', 'js')) && !source.endsWith('.less'),
    });

    for await (const file of require('node:fs').globSync('**/*.less', { cwd: 'public/style' })) {
        if (/^(bs|fonts)\//.test(file)) {
            continue;
        }

        const filename = path.resolve('public/style', file);
        const result = await less.render(await fs.readFile(filename, 'utf8'), {
            filename, compress: minify, strictImports: true,
            sourceMap: { outputSourceFiles: true, sourceMapURL: path.basename(file, '.less') + '.css.map' },
        });
        const dest = path.join(outdir, 'style', file.replace(/\.less$/, '.css'));

        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, result.css);
        if (result.map) {
            await fs.writeFile(dest + '.map', result.map);
        }
    }

    const plugin = {
        name: 'pastvu-assets',
        setup(build) {
            build.onResolve({ filter: /\?raw$/ }, args => {
                const id = args.path.slice(0, -4);
                const filename = resolveModule(id, args.importer).replace(/\.js$/, '');

                return { path: filename, namespace: 'template' };
            });
            build.onLoad({ filter: /.*/, namespace: 'template' }, async args => {
                // Templates remain HTML strings consumed by the existing doT renderer.
                const relative = path.relative(path.resolve('public/tpl'), args.path);
                const filename = path.resolve('views/module', relative);
                const template = args.path.endsWith('.pug');
                const content = template ? pug.renderFile(filename, {
                    config: { env, hash }, pretty: false,
                }) : await fs.readFile(args.path, 'utf8');

                return { contents: content, loader: 'text', watchFiles: [template ? filename : args.path] };
            });
            build.onResolve({ filter: /\.css$/ }, args => ({
                path: resolveModule(args.path, args.importer).replace(/\.js$/, ''), namespace: 'stylesheet',
            }));
            build.onLoad({ filter: /.*/, namespace: 'stylesheet' }, async args => {
                const relative = path.relative(path.resolve('public/style'), args.path);
                const contents = await fs.readFile(path.join(outdir, 'style', relative));
                const digest = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12);
                const url = '/style/' + relative.split(path.sep).join('/') + '?v=' + digest;

                return { contents: `const link = document.createElement('link');
link.rel = 'stylesheet'; link.href = ${JSON.stringify(url)};
const ready = new Promise((resolve, reject) => {
    link.onload = resolve; link.onerror = () => reject(new Error('Unable to load stylesheet: ' + link.href));
});
document.head.appendChild(link);
export default await ready;`, loader: 'js' };
            });
            build.onResolve({ filter: /^[\w@]/ }, args => ({ path: resolveModule(args.path, args.importer) }));
            build.onLoad({ filter: /\/lib\/.*\.js$/ }, async args => {
                const source = await fs.readFile(args.path, 'utf8');

                if (/^import |^export /m.test(source) || args.path.endsWith('/JSExtensions.js')) {
                    return undefined;
                }

                return { contents: vendorModule(source, args.path), loader: 'js', resolveDir: path.dirname(args.path) };
            });
        },
    };

    const result = await esbuild.build({
        entryPoints: {
            'module/appMain': 'public/js/module/appMain.js',
            'module/appAdmin': 'public/js/module/appAdmin.js',
        },
        outdir: path.join(outdir, 'js'), bundle: true, splitting: true, format: 'esm',
        target: browserslistToEsbuild(), minify, sourcemap: true, metafile: true,
        chunkNames: 'chunks/[name]-[hash]', assetNames: 'assets/[name]-[hash]',
        banner: { js: header }, plugins: [plugin], logLevel: 'silent',
    });

    for (const warning of await esbuild.formatMessages(result.warnings, { kind: 'warning', color: false })) {
        console.warn(warning);
    }

    console.log(`Frontend built: ${Object.keys(result.metafile.outputs).length} files`);
    await fs.writeFile(path.join(outdir, 'js/metafile.json'), JSON.stringify(result.metafile, null, 2));
}

module.exports = { buildAssets };

if (require.main === module) {
    const watch = process.argv.includes('--watch');
    let running = false;
    let pending = false;
    let timer;
    const rebuild = async () => {
        if (running) {
            pending = true;

            return;
        }

        running = true;

        try {
            await buildAssets({ minify: !watch });
        } catch (error) {
            console.error(error);
            if (!watch) {
                process.exitCode = 1;
            }
        } finally {
            running = false;
            if (pending) {
                pending = false;
                rebuild();
            }
        }
    };

    rebuild();

    if (watch) {
        for (const dir of ['public/js', 'public/style', 'views/module']) {
            require('node:fs').watch(dir, { recursive: true }, () => {
                clearTimeout(timer);
                timer = setTimeout(rebuild, 150);
            });
        }
    }
}

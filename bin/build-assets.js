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
const shimConfig = require('./frontend-shims');

const root = path.resolve('public/js');
const npmPackages = new Set(['@turf/turf', 'dot/doT', 'i18next', 'lodash', 'moment', 'moment/locale/ru', 'socket.io-client', 'underscore.string']);
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

// Shims keyed by resolved filename, so lookups do not depend on how a library was imported.
const shims = new Map(Object.entries(shimConfig).map(([id, shim]) => {
    const filename = resolveModule(id);

    if (!require('node:fs').existsSync(filename)) {
        throw new Error(`bin/frontend-shims.js: '${id}' does not resolve to a file (${path.relative('.', filename)})`);
    }

    return [filename, shim];
}));

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

    // Browser-only plugins depend on globals and declare nothing; their shim imports
    // the dependencies first to enforce execution order.
    const shim = shims.get(filename);
    const relative = path.relative('.', filename);

    if (source.includes('define(')) {
        if (shim) {
            throw new Error(`${relative} declares its dependencies with define(); remove it from bin/frontend-shims.js`);
        }
    } else if (!shim) {
        throw new Error(`${relative} is a vendored library without define() or ES module syntax; ` +
            'declare its dependencies in bin/frontend-shims.js');
    } else {
        shim.deps.forEach(dep => deps.add(dep));
    }

    const imports = [...deps].filter(id => !['exports', 'module', 'require'].includes(id));
    const bindings = imports.map((id, index) => {
        let specifier = id;

        if (id.startsWith('css!')) {
            specifier = id.slice(4) + '.css';
        } else if (!npmPackages.has(id)) {
            specifier = resolveModule(id, filename);
        }

        return `import dep${index} from ${JSON.stringify(specifier)};`;
    }).join('\n');
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
export default result === undefined ? ${shim?.exports ? 'window.' + shim.exports : 'vendorExports'} : result;
`;
}

const styleRoot = path.resolve('public/style');
const entries = {
    'module/appMain': 'public/js/module/appMain.js',
    'module/appAdmin': 'public/js/module/appAdmin.js',
};

// Recreate the output tree with static files; JS and CSS are written by the build itself.
async function prepareOutput(outdir) {
    await fs.rm(outdir, { recursive: true, force: true });
    await fs.cp('public', outdir, {
        recursive: true,
        filter: source => source !== path.join('public', 'js') && !source.startsWith(path.join('public', 'js') + path.sep) &&
            !source.endsWith('.less'),
    });
}

const mtime = async file => (await fs.stat(file).catch(() => null))?.mtimeMs ?? Infinity;

async function isFresh(state) {
    if (!state) {
        return false;
    }

    for (const dep of state.deps) {
        if (await mtime(dep) > state.time) {
            return false;
        }
    }

    return true;
}

// LESS compiler that remembers each stylesheet's imports, so later runs recompile
// only the stylesheets whose source or imported files have changed.
function createStyles({ outdir, minify }) {
    const compiled = new Map();

    async function compile() {
        const errors = [];
        let count = 0;

        for (const file of require('node:fs').globSync('**/*.less', { cwd: styleRoot })) {
            const filename = path.join(styleRoot, file);

            if (/^(bs|fonts)\//.test(file) || await isFresh(compiled.get(filename))) {
                continue;
            }

            const time = Date.now();

            try {
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

                compiled.set(filename, { time, deps: [filename, ...result.imports.map(dep => path.resolve(dep))] });
                count++;
            } catch (error) {
                compiled.delete(filename);
                errors.push({
                    text: error.message,
                    location: error.filename ? {
                        file: path.relative('.', error.filename), line: error.line, column: error.column,
                        lineText: error.extract?.[1] ?? '',
                    } : null,
                });
            }
        }

        return { count, errors };
    }

    // Every LESS source and directory, so the watcher also notices imports and new files.
    function watchList() {
        const files = require('node:fs').globSync('**/*.less', { cwd: styleRoot }).map(file => path.join(styleRoot, file));
        const dirs = [styleRoot, ...require('node:fs').globSync('**/', { cwd: styleRoot }).map(dir => path.join(styleRoot, dir))];

        return { watchFiles: files, watchDirs: [...new Set(dirs)] };
    }

    return { compile, watchList };
}

function esbuildOptions({ outdir, hash, minify, env, styles, onEnd }) {
    const vendorCache = new Map();
    const templateCache = new Map();

    const plugin = {
        name: 'pastvu-assets',
        setup(build) {
            // LESS is outside the JS graph, so compile it before each build. Stylesheet
            // modules below read the compiled CSS to fingerprint their URLs.
            build.onStart(async () => {
                const { count, errors } = await styles.compile();

                if (count) {
                    console.log(`Compiled ${count} stylesheet${count === 1 ? '' : 's'}`);
                }

                return { errors };
            });
            if (onEnd) {
                build.onEnd(onEnd);
            }

            build.onResolve({ filter: /\.js$/ }, args => {
                if (args.kind !== 'entry-point') {
                    return undefined;
                }

                // Attach LESS sources to the entry points so esbuild's watcher rebuilds on style edits.
                return { path: path.resolve(args.path), ...styles.watchList() };
            });
            build.onResolve({ filter: /\?raw$/ }, args => {
                const id = args.path.slice(0, -4);
                const filename = resolveModule(id, args.importer).replace(/\.js$/, '');

                return { path: filename, namespace: 'template' };
            });
            build.onLoad({ filter: /.*/, namespace: 'template' }, async args => {
                // Templates remain HTML strings consumed by the existing doT renderer.
                const relative = path.relative(path.resolve('public/tpl'), args.path);
                const filename = path.resolve('views/module', relative);
                if (!args.path.endsWith('.pug')) {
                    return { contents: await fs.readFile(args.path, 'utf8'), loader: 'text', watchFiles: [args.path] };
                }

                // Rendering every template on each rebuild is slow; reuse output until a source changes.
                let cached = templateCache.get(filename);

                if (!await isFresh(cached)) {
                    const time = Date.now();
                    const render = pug.compileFile(filename);

                    cached = { time, deps: [filename, ...render.dependencies], contents: render({ config: { env, hash } }) };
                    templateCache.set(filename, cached);
                }

                return { contents: cached.contents, loader: 'text', watchFiles: cached.deps };
            });
            build.onResolve({ filter: /\.css$/ }, args => ({
                path: resolveModule(args.path, args.importer).replace(/\.js$/, ''), namespace: 'stylesheet',
            }));
            build.onLoad({ filter: /.*/, namespace: 'stylesheet' }, async args => {
                const relative = path.relative(styleRoot, args.path);
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
            build.onResolve({ filter: /^[\w@]/ }, args => {
                if (args.importer.startsWith(root + path.sep) && !npmPackages.has(args.path)) {
                    return { path: resolveModule(args.path, args.importer) };
                }
            });
            build.onLoad({ filter: /\/lib\/.*\.js$/ }, async args => {
                if (!args.path.startsWith(path.join(root, 'lib') + path.sep)) {
                    return undefined;
                }

                const source = await fs.readFile(args.path, 'utf8');

                if (/^import |^export /m.test(source) || args.path.endsWith('/JSExtensions.js')) {
                    return undefined;
                }

                // Plugin results are not cached by esbuild between rebuilds; wrapping parses with Babel.
                let cached = vendorCache.get(args.path);

                if (cached?.source !== source) {
                    cached = { source, contents: vendorModule(source, args.path) };
                    vendorCache.set(args.path, cached);
                }

                return { contents: cached.contents, loader: 'js', resolveDir: path.dirname(args.path) };
            });
        },
    };

    return {
        entryPoints: entries,
        outdir: path.join(outdir, 'js'), bundle: true, splitting: true, format: 'esm',
        target: browserslistToEsbuild(), minify, sourcemap: true, metafile: true,
        chunkNames: 'chunks/[name]-[hash]', assetNames: 'assets/[name]-[hash]',
        banner: { js: header }, plugins: [plugin], logLevel: 'silent',
    };
}

async function report(result, outdir) {
    for (const message of await esbuild.formatMessages(result.warnings, { kind: 'warning', color: false })) {
        console.warn(message);
    }

    if (result.metafile) {
        console.log(`Frontend built: ${Object.keys(result.metafile.outputs).length} files`);
        await fs.writeFile(path.join(outdir, 'js/metafile.json'), JSON.stringify(result.metafile, null, 2));
    }
}

async function buildAssets({ outdir = 'public-build', hash = 'development', minify = true, env = minify ? 'production' : 'development' } = {}) {
    await prepareOutput(outdir);

    const styles = createStyles({ outdir, minify });

    await report(await esbuild.build(esbuildOptions({ outdir, hash, minify, env, styles })), outdir);
}

// Incremental development build: esbuild watches JS, templates, and LESS sources and
// rebuilds into the existing output, which is never wiped while the watcher runs.
async function watchAssets({ outdir = 'public-build', hash = 'development', minify = false, env = 'development' } = {}) {
    await prepareOutput(outdir);

    const styles = createStyles({ outdir, minify });
    const ctx = await esbuild.context(esbuildOptions({
        outdir, hash, minify, env, styles,
        onEnd: async result => {
            if (result.errors.length) {
                for (const message of await esbuild.formatMessages(result.errors, { kind: 'error', color: false })) {
                    console.error(message);
                }

                console.error(`Frontend build failed with ${result.errors.length} error(s); watching for changes`);

                return;
            }

            await report(result, outdir);
        },
    }));

    await ctx.watch();
    console.log('Watching frontend sources for changes');

    return ctx;
}

module.exports = { buildAssets, watchAssets };

if (require.main === module) {
    if (process.argv.includes('--watch')) {
        watchAssets().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    } else {
        buildAssets().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    }
}

# Server ESM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the PastVu backend as native ES modules on Node 26 — delete the Babel transpile layer in dev (`@babel/register`) and prod (`grunt-babel`).

**Architecture:** Flip the root package to `"type": "module"`. Shield deliberate CommonJS islands (`config/`, `migrations/`, `basepatch/`, build scripts) with nested `package.json` type fields or `.cjs` renames. Codemod explicit `.js` extensions onto all relative imports (native ESM has no extension-less/directory resolution). Convert the ~23 remaining CJS/mixed server files to ESM. Jest runs in native ESM mode via `--experimental-vm-modules`.

**Tech Stack:** Node 26.3 (native ESM, `require(esm)`, `import.meta.dirname`), Jest 30 ESM mode, Grunt (build), ESLint 10 flat config + `eslint-plugin-n`.

**Spec:** `docs/superpowers/specs/2026-07-19-server-esm-migration-design.md`

## Global Constraints

- Node version: `26.3.0` (from `engines`); dev machine runs 26.5 — both fine.
- `config/local.config.js` (deployment-edited) must keep working **unchanged** in `module.exports = ...` format. Never change the `config/` loading contract.
- Frontend (`public/`, RequireJS/AMD) is out of scope — do not touch `public/` except where explicitly listed.
- All files keep the AGPL copyright header (enforced by eslint-plugin-headers).
- `@babel/cli`, `@babel/core`, `@babel/preset-env`, `@babel/register`, `babel-jest`, `grunt-babel` must be gone at the end. `@babel/parser` + `@babel/traverse` are **kept** (added explicitly) — the `bin/*-i18n*.js` CLIs use them as a JS parser, not as a transpiler. (Deviation from spec's "all @babel/* removed" — approved rationale: parser ≠ transpile layer.)
- Verification baseline commands: `npx jest --runInBand`, `npx eslint .`, `npx grunt` (build), `npx grunt test`.

## Known red windows (by design — big-bang flip)

- After Task 2 and until Task 3: Jest is red (still configured for babel-jest).
- After Task 2 and until Task 5: `npx eslint .` may be red (`eslint.config.js` converted in Task 5).
Each task states what MUST be green at its end. The branch is only mergeable after Task 6.

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b esm-migration`

---

### Task 1: Build-layer prep and CommonJS islands (everything stays green; Babel still active)

Everything in this task is safe before the flip: renames to `.cjs`, nested `package.json` shields, and removing the *vestigial* babel hooks from Gruntfile/build.js (they only exist to require `commons/Utils`, which is plain CJS today, so the hook is already unnecessary).

**Files:**
- Create: `migrations/package.json`, `basepatch/package.json`
- Modify: `config/package.json`, `tests/globalSetup.js`
- Rename+Modify: `Gruntfile.js` → `Gruntfile.cjs`, `build.js` → `build.cjs`, `.stylelintrc.js` → `.stylelintrc.cjs`, `api.js` → `api.cjs`, `tests/test.config.js` → `tests/test.config.cjs`

**Interfaces:**
- Produces: `Gruntfile.cjs` with no `babel` task — the `copy` task now also copies the previously-transpiled server sources verbatim into `appBuild/`. Later tasks rely on `grunt` producing a source-identical `appBuild`.

- [ ] **Step 1: Shield CJS directories**

Create `migrations/package.json`:
```json
{
    "type": "commonjs"
}
```
Create `basepatch/package.json` with the same content.
In `config/package.json` add the type field:
```json
{
    "main": "./server",
    "browser": "./client",
    "type": "commonjs"
}
```

- [ ] **Step 2: Rename CJS root files**

```bash
git mv Gruntfile.js Gruntfile.cjs
git mv build.js build.cjs
git mv .stylelintrc.js .stylelintrc.cjs
git mv api.js api.cjs
git mv tests/test.config.js tests/test.config.cjs
```

- [ ] **Step 3: Update references to renamed files**

In `tests/globalSetup.js` line 9:
```js
// old
process.argv.push('--config', __dirname + '/test.config.js');
// new
process.argv.push('--config', __dirname + '/test.config.cjs');
```
In `Gruntfile.cjs`: `configFile: '.stylelintrc.js'` → `configFile: '.stylelintrc.cjs'`; in the `copy` task patterns `'api.js'` → `'api.cjs'`; in `exec.buildjs` `command: 'node build.js'` → `command: 'node build.cjs'`.

- [ ] **Step 4: De-babel the Gruntfile**

In `Gruntfile.cjs`:
1. Delete line `require('./bin/run');`
2. Delete `const Utils = require('./commons/Utils');` and `const babelConfig = require('./babel/server.config');`
3. Replace `const hash = Utils.randomString(5);` with a local helper (Gruntfile must not depend on the app module graph):
```js
const randomString = length => Array.from(
    { length },
    () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]
).join('');
const hash = randomString(5);
```
4. Delete the whole `babel: { ... }` config block and `grunt.loadNpmTasks('grunt-babel');`, and remove `'babel'` from the `default` task list.
5. Fold the babel glob list into the `copy` task's `patterns` array (these were previously transpiled, now copied verbatim):
```js
const patterns = [
    'app/**', 'bin/**', 'migrations/**', 'commons/**', 'misc/watermark/**',
    'controllers/*.js', 'npm-shrinkwrap.json',
    '@(app|downloader|uploader|sitemap|notifier|worker).js',
    'models/*.js',
    'config/@(client|server|log4js|migrate-mongo|default.config).js',
    'config/package.json',
    'views/app.pug', 'views/api/**', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**',
    'api.cjs', 'package.json', 'README',
];
```
(Note: `controllers/*.js` now replaces both the old `controllers/systemjs.js` copy entry and the old `controllers/!(systemjs|api|apilog).js` babel glob — copying `api.js`/`apilog.js` too is harmless and simpler. `commons/**` and `app/**` were already copied; `migrations/**` picks up the new `package.json` automatically.)
6. In the `eslint.all.files.src` list, remove `'babel/*.js'` (directory dies in Task 4) and add `'*.cjs'`.

- [ ] **Step 5: De-babel build.cjs**

In `build.cjs` delete the line `require('./bin/run');`. Leave `const Utils = require('./commons/Utils');` — it resolves to plain CJS today; Task 2 updates it.

- [ ] **Step 6: Verify green**

```bash
npx grunt writeBuildParams   # Expected: "Build json: {...}" then Done. Proves Gruntfile.cjs loads.
npx jest --runInBand         # Expected: all suites pass (babel-jest still active).
node build.cjs               # Expected: frontend build starts (Ctrl-C after it begins working, or let it finish).
```
If grunt cannot find `Gruntfile.cjs` (grunt-cli quirk), add `--gruntfile Gruntfile.cjs` to the npm `build`/`test` scripts instead of reverting the rename.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "build: isolate CommonJS islands and drop vestigial babel hooks from build layer"
```

---

### Task 2: The flip — `"type": "module"`, extension codemod, runtime conversions

At the end of this task all six entry scripts run natively. Jest/ESLint red until Tasks 3/5.

**Files:**
- Modify: `package.json` (type field only), all ESM-syntax server files (codemod), `app.js`, `bin/run.js`, `commons/Utils.js`, `commons/i18n.js`, `models/pagination.js`, `models/Sessions.js`, `controllers/connection.js`, `controllers/middleware.js`, `controllers/migration.js`, `controllers/systemjs.js`, `bin/find-untranslated-i18n.js`, `bin/migrate-i18n-keys-to-english.js`, `build.cjs`, `.docker/backend.Dockerfile`
- Create (scratchpad, not committed): `add-extensions.mjs` codemod

**Interfaces:**
- Consumes: CJS islands from Task 1 (`config/` stays require-able).
- Produces: every server module importable as native ESM with explicit `.js` specifiers; `commons/Utils.js` has `export default Utils`; `commons/i18n.js` keeps its existing named exports; `bin/run.js` loads `--script` targets via dynamic `import()` and calls their exported `configure(startStamp)`.

- [ ] **Step 1: Flip the type**

In root `package.json` add `"type": "module",` after `"main": "app.js",`.

- [ ] **Step 2: Write the extension codemod** to the session scratchpad as `add-extensions.mjs`:

```js
import fs from 'fs';
import path from 'path';

const ROOTS = ['app.js', 'worker.js', 'uploader.js', 'downloader.js', 'sitemap.js', 'notifier.js',
    'app', 'controllers', 'models', 'commons', 'tests', 'bin'];

const files = [];
const collect = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) fs.readdirSync(p).forEach(f => collect(path.join(p, f)));
    else if (p.endsWith('.js')) files.push(p);
};
ROOTS.forEach(collect);

// import x from './y'; export { z } from './y'; import './y'; import('./y')
const SPEC_RE = /((?:from|import)\s*\(?\s*)(['"])(\.\.?\/[^'"]+)\2/g;

for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let changed = false;
    const out = src.replace(SPEC_RE, (match, lead, q, spec) => {
        const abs = path.resolve(path.dirname(file), spec);
        let fixed = null;

        if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
            // Directory import: resolve via its package.json "main" (native ESM ignores it)
            const pkgPath = path.join(abs, 'package.json');
            let main = 'index.js';
            if (fs.existsSync(pkgPath)) {
                main = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).main || main;
            }
            fixed = (spec.replace(/\/$/, '') + '/' + main.replace(/^\.\//, ''));
            if (!path.extname(fixed)) fixed += '.js';
        } else if (!path.extname(abs) && fs.existsSync(abs + '.js')) {
            fixed = spec + '.js';
        }

        if (!fixed || fixed === spec) return match;
        changed = true;
        console.log(`${file}: ${spec} -> ${fixed}`);
        return `${lead}${q}${fixed}${q}`;
    });
    if (changed) fs.writeFileSync(file, out);
}
```

- [ ] **Step 3: Run the codemod and review**

```bash
node <scratchpad>/add-extensions.mjs
git diff --stat
```
Expected: ~70+ files changed; every logged rewrite is `./x -> ./x.js` or `../config -> ../config/server.js`. Spot-check `git diff app.js controllers/photo.js`. Specifiers already carrying `.js`/`.json` must be untouched.

- [ ] **Step 4: Rewrite `bin/run.js` as ESM**

Replace the whole file with:

```js
#!/usr/bin/env node
/**
 * Entry point to application. Its purpose is to run the requested script with common setup.
 */
import os from 'os';
import path from 'path';
import util from 'util';
import { pathToFileURL } from 'url';
import _ from 'lodash';
import log4js from 'log4js';
import config from '../config/server.js';

const startStamp = Date.now();

const { values: argv } = util.parseArgs({
    options: {
        script: { type: 'string', short: 's', default: 'app.js' },
        primary: { type: 'boolean', default: false },
        logConfig: { type: 'boolean', default: true },
    },
    strict: false,
});

const env = config.env;
const appName = path.parse(argv.script).name;
const logger = log4js.getLogger(appName);

if (appName === 'notifier') config.notifier = true;
config.primary = !!argv.primary; // If not true, the instance will run as a replica

// Handling uncaught exceptions
process.on('uncaughtException', err => {
    logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
    logger.trace(err && (err.stack || err));
});

// Displays information about the environment and configuration
logger.info('●▬▬▬▬▬▬▬▬ ★ ▬▬▬▬▬▬▬▬●');
logger.info(
    `Starting ${appName} server v${config.version} in ${env.toUpperCase()} mode with NODE_ENV=${process.env.NODE_ENV}`
);
logger.info(`Platform: ${process.platform}, architecture: ${process.arch} with ${os.cpus().length} cpu cores`);
logger.info(`Node.js [${process.versions.node}] with v8 [${process.versions.v8}] on pid: ${process.pid}`);

if (argv.logConfig) {
    logger.info('Configuration:\n', util.inspect(
        // Do deep clone of config and shade password fields
        _.cloneDeep(config, (val, key) => key === 'pass' ? '######' : undefined),
        { depth: null, colors: env === 'development' }
    ));
}

const requiredModule = await import(pathToFileURL(path.resolve(argv.script)).href);

if (typeof requiredModule.configure === 'function') {
    // Wrap configuration within try to catch error and exit
    try {
        const result = requiredModule.configure(startStamp);

        // If configuration has returned Promise, handle error with catch()
        if (result && result.catch) {
            result.catch(err => {
                logger.error(err);
                process.exit(1);
            });
        }
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
}
```

Notes: the `require.main !== module` / `module.exports = requireModule` branch is deleted — its only consumers (Gruntfile, build.js) stopped requiring `bin/run` in Task 1. The babel hook is gone entirely.

- [ ] **Step 5: Convert `commons/Utils.js`**

- Header requires → imports (`fs`, `path`, `lodash` as `_`, `underscore.string` as `_s`, `{ UAParser }`, `diff-match-patch` as `DMP`, `@turf/turf` as `* as turf`, `ms`), and `const config = require('../config');` → `import config from '../config/server.js';`
- Line ~30 lazy `new (require('lru-cache').LRUCache)({ max: 1500 })` → add top `import { LRUCache } from 'lru-cache';` and use `new LRUCache({ max: 1500 })`.
- Bottom: `module.exports = Utils;` → `export default Utils;`
- Sweep the rest of the file for any other `require(` occurrences and convert the same way.

- [ ] **Step 6: Convert `commons/i18n.js`**

Requires → imports; JSON loaded via `fs` (NOT import attributes — keeps Jest ESM compatibility):

```js
import fs from 'fs';
import i18next from 'i18next';
import { parseCookie } from 'cookie';
import Negotiator from 'negotiator';
import config from '../config/server.js';

const readJSON = relPath => JSON.parse(fs.readFileSync(new URL(relPath, import.meta.url), 'utf8'));
const translationsEn = readJSON('../public/js/lang/i18n.en.json');
const translationsRu = readJSON('../public/js/lang/i18n.ru.json');
const mailEn = readJSON('../views/mail/i18n.en.json');
const mailRu = readJSON('../views/mail/i18n.ru.json');
const statusEn = readJSON('../views/status/i18n.en.json');
const statusRu = readJSON('../views/status/i18n.ru.json');
```
Convert whatever `module.exports`/`exports.X` the file ends with into named `export`s matching current consumers (`app.js` imports `{ i18nLocals }` — preserve every existing export name exactly).

- [ ] **Step 7: Convert the small server files**

`models/pagination.js`: `const mongoose = require('mongoose');` → `import mongoose from 'mongoose';` (side-effect module, no exports — nothing else changes).

`models/Sessions.js`: add top `import { AnonymScheme } from './User.js';`; replace both `anonym: require('./User').AnonymScheme,` occurrences with `anonym: AnonymScheme,` (verified: `models/User.js` does not import Sessions — no cycle).

`controllers/systemjs.js`: replace the three header requires with:
```js
import log4js from 'log4js';
import mongoose from 'mongoose';
import { waitDb } from './connection.js';
```
Do NOT touch anything below the header — the function bodies are stored into MongoDB `system.js` and must stay byte-identical. Remove the stale "not being transformed by babel" comment. If the file has a `module.exports` at the bottom, convert to the equivalent `export`.

`controllers/connection.js`: hoist the lazy requires — line ~64 `const mongoose = require('mongoose');` and line ~150 `const Redis = require('ioredis');` become top-level `import mongoose from 'mongoose';` / `import Redis from 'ioredis';` (dedupe if mongoose is already imported), delete the inline lines.

`controllers/middleware.js` (`lessToCss`): the factory stays sync; the import moves into the async handler with a cached promise:
```js
export function lessToCss(styleDir) {
    // less is a devDep loaded on demand — production never calls this handler.
    let lessPromise;

    return async (req, res, next) => {
        if (!req.path.endsWith('.css')) {
            return next();
        }

        const { default: less } = await (lessPromise ??= import('less'));
        // ...rest of the existing handler body unchanged, using `less` as before
    };
}
```

`controllers/migration.js`: delete the `importESM = new Function(...)` workaround and its long comment block; replace with:
```js
// migrate-mongo@14 is ESM-only; load it lazily so test runs (which skip
// migration checks) never evaluate it.
let migratePromise;
const getMigrate = () => (migratePromise ??= import('migrate-mongo'));
```
Also remove the now-unused `// eslint-disable-next-line no-new-func`.

`controllers/converter.js` line ~40: `path.join(__dirname, '/../misc/watermark/')` → `path.join(import.meta.dirname, '/../misc/watermark/')` (the only `__dirname` in server sources; Babel never rewrote it, native ESM has no `__dirname`).

- [ ] **Step 8: Convert `app.js` inline requires to static imports**

Add to the import block at the top:
```js
import compression from 'compression';
import serveFavicon from 'serve-favicon';
import rewrite from 'express-urlrewrite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import basicAuthConnect from 'basic-auth-connect';
import serveIndex from 'serve-index';
import { loadController as loadTplController } from './controllers/tpl.js';
```
Then replace the call sites (lines ~119, ~131, ~143-144, ~218, ~224-225):
- `app.use(require('compression')());` → `app.use(compression());`
- `app.use(require('serve-favicon')(` → `app.use(serveFavicon(`
- `const rewrite = require('express-urlrewrite');` → delete (top import)
- `const { createProxyMiddleware } = require('http-proxy-middleware');` → delete
- `require('./controllers/tpl').loadController(app);` → `loadTplController(app);`
- `require('basic-auth-connect')(...)` → `basicAuthConnect(...)`
- `require('serve-index')(logPath, ...)` → `serveIndex(logPath, ...)`
(Confirm `controllers/tpl.js` exports `loadController` as a named export; adjust the import to match its actual export shape.)

- [ ] **Step 9: Convert the two `bin/` i18n CLIs**

In `bin/find-untranslated-i18n.js` and `bin/migrate-i18n-keys-to-english.js`, convert requires to imports. CJS-interop pattern for traverse:
```js
import fs from 'fs';
import path from 'path';
import parser from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default ?? traverseModule;
```
Convert any `__dirname` to `import.meta.dirname` and any `module.exports` to `export`s.

- [ ] **Step 10: Point `build.cjs` at the now-ESM Utils**

`const Utils = require('./commons/Utils');` → `const Utils = require('./commons/Utils.js').default;` (Node 26 `require(esm)` — synchronous, no flag needed; Utils has no top-level await).

- [ ] **Step 11: Explicit Docker entry**

`.docker/backend.Dockerfile` line 18: `CMD ["bin/run"]` → `CMD ["bin/run.js"]` (extension-less entry resolution is CJS-loader behavior; don't rely on it under `type: module`).

- [ ] **Step 12: Syntax sweep**

```bash
for f in app.js worker.js uploader.js downloader.js sitemap.js notifier.js bin/run.js $(find app controllers models commons -name '*.js' -not -path '*__tests__*' -not -path '*__mocks__*'); do node --check "$f" || echo "FAIL $f"; done
```
Expected: no FAIL lines. (`node --check` parses per package type — catches leftover `require`/`module.exports` in ESM scope as undefined-identifier only at runtime, but catches syntax-level breakage now.)

```bash
grep -rnE "\brequire\(|module\.exports" app controllers models commons app.js worker.js uploader.js downloader.js sitemap.js notifier.js bin/run.js | grep -v "createRequire"
```
Expected: no hits (all server ESM files are require-free). `eslint.config.js` and `jest.config.js` are intentionally excluded — they convert in Tasks 5 and 3.

- [ ] **Step 13: Runtime smoke — every entry script**

Start backing services, then each script (they need Mongo/Redis from docker-compose):
```bash
docker compose up -d mongo redis   # service names per docker-compose.yml
npm run app          # Expected: banner + "Starting app server v2.0.56 in DEVELOPMENT mode", express listening. Ctrl-C.
npm run worker       # Expected: clean startup, no ERR_MODULE_NOT_FOUND / ReferenceError: require. Ctrl-C.
npm run notifier     # same
npm run sitemap      # same
npm run uploader     # same
npm run downloader   # same
```
Typical failures and fixes: `ERR_MODULE_NOT_FOUND` → a specifier the codemod missed (fix by hand); `The requested module 'x' does not provide an export named 'y'` → CJS dep whose named import isn't statically detectable → switch to `import pkg from 'x'; const { y } = pkg;`; `require is not defined` → a leftover conversion from Step 12's grep.

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat!: run the server as native ES modules (type: module)"
```

---

### Task 3: Jest in native ESM mode

**Files:**
- Modify: `package.json` (jest script), `jest.config.js`, `tests/setup.js`, `tests/globalSetup.js`, `controllers/__tests__/subscr.test.js`, `controllers/__mocks__/mail.js`, `commons/__tests__/i18n-completeness.test.js`, `commons/__tests__/no-russian-source.test.js`, `commons/__tests__/i18n.test.js`
- Delete: `tests/__mocks__/migrate-mongo.js`

**Interfaces:**
- Consumes: ESM server modules from Task 2.
- Produces: `npm run jest` green natively; no babel-jest.

- [ ] **Step 1: npm script**

```json
"jest": "NODE_OPTIONS=--experimental-vm-modules jest --runInBand",
```

- [ ] **Step 2: `jest.config.js` becomes ESM and loses the babel workarounds**

Replace the whole file body (keep the copyright header):
```js
export default {
    testEnvironment: 'node',
    transform: {},
    globalSetup: './tests/globalSetup.js',
    globalTeardown: './tests/globalTeardown.js',
    setupFilesAfterEnv: ['./tests/setup.js'],
};
```
(Removed: `babel-jest` transform, the `cookie` `transformIgnorePatterns` exception, the `migrate-mongo` `moduleNameMapper` stub — `cookie` is imported natively now, and `migrate-mongo` is lazily imported only outside `NODE_ENV=test`.) Also `rm tests/__mocks__/migrate-mongo.js`.

- [ ] **Step 3: `tests/setup.js` — ESM mocking**

`jest` is not a global in ESM mode; the mail mock must be registered before the mocked graph loads:
```js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../controllers/mail.js', () => import('../controllers/__mocks__/mail.js'));

const { default: connectDb, waitDb } = await import('../controllers/connection.js');
const { default: mongoose } = await import('mongoose');
const { UserSettings } = await import('../models/UserSettings.js');
```
Rest of the file (beforeAll/afterEach/etc. and `seedDatabase`) unchanged. In `controllers/__mocks__/mail.js` add `import { jest } from '@jest/globals';` above the `jest.fn()` use.

- [ ] **Step 4: `controllers/__tests__/subscr.test.js` — ESM mocking**

```js
import { jest } from '@jest/globals';
import _ from 'lodash';
import { UserObjectRel, UserNoty } from '../../models/UserStates.js';
import testHelpers from '../../tests/testHelpers.js';

// Mock user settings, they will be used in profile.changeSetting.
jest.unstable_mockModule('../settings.js', () => ({
    userSettingsDef: { 'subscr_disable_noty': false },
    userSettingsVars: { 'subscr_disable_noty': [true, false] },
}));

const { commentAdded, commentViewed, getUserObjectRel } = await import('../subscr.js');
const { default: profile } = await import('../profile.js');
```
If linking fails with "does not provide an export named X", the real `../settings.js` has more consumed exports than the old factory faked — add those names to the factory (ESM mock factories must cover every linked export, unlike CJS).

- [ ] **Step 5: Convert the CJS/mixed test files**

- `commons/__tests__/i18n-completeness.test.js`, `commons/__tests__/no-russian-source.test.js`: requires → imports; `__dirname` → `import.meta.dirname`; add `import { jest } from '@jest/globals';` if they use the `jest` API.
- `commons/__tests__/i18n.test.js` line ~200: `const i18next = require('i18next');` → hoist to a top-level `import i18next from 'i18next';` (dedupe with existing imports).
- `tests/globalSetup.js`: `__dirname` → `import.meta.dirname`.
- Sweep: `grep -rln "jest\." tests controllers/__tests__ commons/__tests__ app controllers models --include='*.test.js' --include='setup.js' --include='testHelpers.js'` — every hit needs the `@jest/globals` import (describe/it/expect stay injected as globals; only `jest` isn't).

- [ ] **Step 6: Run and fix**

```bash
npm run jest
```
Expected: all suites pass, no `--experimental-vm-modules` warnings beyond Node's standard ExperimentalWarning. Known trap: a test that statically imports a module whose mock is registered in the same file — must use `await import()` after `unstable_mockModule` (Step 4 pattern).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "test: run Jest in native ESM mode, drop babel-jest and ESM-dep workarounds"
```

---

### Task 4: Remove Babel

**Files:**
- Delete: `babel/` (server.config.js, server.files.js)
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Remove**

```bash
git rm -r babel
npm uninstall @babel/cli @babel/core @babel/preset-env @babel/register babel-jest grunt-babel
npm install -D @babel/parser @babel/traverse   # kept deliberately: parser for bin/*-i18n CLIs
```

- [ ] **Step 2: Verify nothing references babel**

```bash
grep -rn "babel" package.json Gruntfile.cjs jest.config.js bin config docs/README.md 2>/dev/null | grep -v parser | grep -v traverse
```
Expected: no hits (spec doc mentions are fine).

```bash
npm run i18n:check    # Expected: the untranslated-i18n scanner runs (uses @babel/parser natively)
npm run jest          # Expected: still green
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "build: remove the Babel transpile layer"
```

---

### Task 5: ESLint — ESM config plus extension enforcement

**Files:**
- Modify: `eslint.config.js`, `package.json` (add `eslint-plugin-n`)

- [ ] **Step 1:** `npm install -D eslint-plugin-n`

- [ ] **Step 2: Convert `eslint.config.js` to ESM**

Top requires → imports; `module.exports = [` → `export default [`:
```js
import globals from 'globals';
import js from '@eslint/js';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import jestPlugin from 'eslint-plugin-jest';
import headersPlugin from 'eslint-plugin-headers';
import nPlugin from 'eslint-plugin-n';
```

- [ ] **Step 3: Add two config blocks** (append before any final overrides so they win):

```js
// Native ESM: relative imports must carry explicit extensions (server code only;
// public/ is AMD and has no import statements).
{
    files: ['*.js', 'app/**/*.js', 'controllers/**/*.js', 'commons/**/*.js', 'models/**/*.js', 'tests/**/*.js', 'bin/**/*.js'],
    plugins: { n: nPlugin },
    rules: {
        'n/file-extension-in-import': ['error', 'always'],
    },
},
// CommonJS islands.
{
    files: ['**/*.cjs', 'config/**/*.js', 'migrations/**/*.js', 'basepatch/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
},
```

- [ ] **Step 4: Lint and fix fallout**

```bash
npx eslint . 
```
Expected failures to fix mechanically: none if the codemod was complete — any `file-extension-in-import` error is a missed specifier; fix it. If `eslint-plugin-n` flags unrelated pre-existing patterns, do NOT enable other n-rules — only `file-extension-in-import` is in scope.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "lint: ESM eslint config, enforce explicit import extensions"
```

---

### Task 6: Full verification sweep

- [ ] **Step 1: The repo's own gates**

```bash
npm test          # grunt test: node-version checks + eslint + stylelint + jest. Expected: PASS.
npm run build     # grunt default: full build into appBuild/. Expected: completes; appBuild/ contains
                  # uncompiled server sources (spot-check: head appBuild/app.js shows `import` statements).
```

- [ ] **Step 2: Production-shaped smoke**

```bash
docker compose build   # builds image from appBuild via .docker/backend.Dockerfile
docker compose up -d
docker compose logs app | head -50   # Expected: "Starting app server ... in PRODUCTION/DEVELOPMENT mode", no module errors
curl -sSf http://localhost:3000/ >/dev/null && echo OK   # Expected: OK
docker compose down
```
(Adjust service names/ports to `docker-compose.yml` if they differ.)

- [ ] **Step 3: Config-compatibility check (the one contract we must not break)**

```bash
node bin/run.js --script ./worker.js --config config/local.config.js.example
```
Expected: starts using the example CJS config — proves deployment `local.config.js` files still load. Ctrl-C.

- [ ] **Step 4: Final commit / spec status**

Update `docs/superpowers/specs/2026-07-19-server-esm-migration-design.md` Status line to `Implemented`. Commit:
```bash
git add -A && git commit -m "docs: mark server ESM migration spec implemented"
```

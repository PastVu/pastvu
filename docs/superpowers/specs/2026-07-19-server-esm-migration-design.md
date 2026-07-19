# Server ESM Migration — Design

Date: 2026-07-19
Status: Implemented
Scope: Backend only. Frontend (`public/`, RequireJS/AMD) is explicitly out of scope.

## Goal

Run the PastVu server as native ES modules on Node 26 — no `@babel/register`
in development, no `grunt-babel` transpile step for production. All `@babel/*`
packages are removed from the repository.

## Current state

- ~71 server files (`app/`, `controllers/`, `models/`, root entry scripts,
  `commons/`) are already written in `import`/`export` syntax, transpiled to
  CommonJS by Babel: `@babel/register` in development (hooked from
  `bin/run.js`), `grunt-babel` into `appBuild/` for production.
- ~13 files are plain CommonJS: `bin/run.js`, `config/*`, `Gruntfile.js`,
  `controllers/systemjs.js`, `models/pagination.js`, `bin/*-i18n*.js`, root
  `api.js`.
- 4 files mix `import` with inline `require()` (`controllers/middleware.js`,
  `controllers/migration.js`, `controllers/connection.js`,
  `models/Sessions.js`); `app.js` has several inline `require()` calls that
  only work because Babel lowers imports to requires.
- Jest uses `babel-jest` and already carries two workarounds for ESM-only
  dependencies (`cookie` transform exception, `migrate-mongo` stub) — symptoms
  of the friction this migration removes.
- Production Docker image copies `appBuild/` and runs `CMD ["bin/run"]`.

## Design

### 1. Module-system flip

- Add `"type": "module"` to the root `package.json`.
- `config/` keeps its own `package.json` **without** a `type` field, so every
  file in it remains CommonJS. This is deliberate: `local.config.js` is
  edited by deployments and its `module.exports` format must keep working
  unchanged. ESM code imports the CJS config via standard interop.

### 2. Import-specifier codemod

Native ESM has no extension-less or directory resolution, so:

- All relative imports in the ~71 ESM-syntax files gain explicit `.js`
  extensions (`./commons/Utils` → `./commons/Utils.js`).
- Directory imports are resolved explicitly: `./config` →
  `./config/server.js` (the `main` field of `config/package.json` is ignored
  by native ESM resolution).
- The rewrite is done by a codemod script; an ESLint rule then enforces
  explicit extensions going forward.

### 3. Converting remaining CJS and mixed files

- The 4 mixed files and `app.js` inline `require()` calls become static
  imports, or `await import()` where loading is genuinely conditional.
- `bin/run.js` is rewritten as ESM: the babel hook is deleted; the target
  script (`app.js`, `worker.js`, …) is loaded with dynamic `import()`. Its
  `require.main !== module` check becomes `import.meta.main` (Node 26).
- Root `api.js`, `models/pagination.js`, `controllers/systemjs.js` (only the
  module wrapper — the function bodies stored into MongoDB `system.js` are
  not touched), and the two `bin/` i18n scripts are converted to ESM.
- `Gruntfile.js` stays CommonJS; renamed to `Gruntfile.cjs` if grunt cannot
  load it otherwise (verified during implementation).
- `__dirname`/`__filename` become `import.meta.dirname`/`import.meta.filename`.
- `migrate-mongo` migration files and config are checked against
  migrate-mongo 14's ESM support; renamed `.cjs` if needed.

### 4. Build and production

- The Gruntfile `babel` task is replaced by a plain copy of server sources
  into `appBuild/`.
- The `babel/` directory and the `@babel/cli`, `@babel/core`,
  `@babel/preset-env`, `@babel/register`, `grunt-babel`, `babel-jest`
  devDependencies are removed.
- The Docker flow is unchanged: `appBuild/` is copied into the image and
  `bin/run` starts it; `appBuild` now contains source-identical server files.

### 5. Tests

- Jest 30 runs in native ESM mode: `NODE_OPTIONS=--experimental-vm-modules`
  added to the `jest` npm script.
- The `babel-jest` transform, the `cookie` `transformIgnorePatterns`
  exception, and the `migrate-mongo` `moduleNameMapper` stub are removed
  (the stub only if verification shows it is no longer needed).
- The 2 `jest.mock()` call sites (`controllers/__tests__/subscr.test.js`,
  `tests/setup.js`) are rewritten with `jest.unstable_mockModule` and dynamic
  import.
- `__dirname` uses in test setup files become `import.meta.dirname`.
- Fallback if native-ESM Jest proves unworkable: keep the test suite on a
  minimal babel-jest island temporarily. Native mode is tried first.

## Risks and mitigations

- **Evaluation-order changes.** Babel executed imports as sequential
  requires; native ESM evaluates the whole import graph before module
  bodies. Config still loads on first import, but side-effect ordering
  across controllers may shift. Mitigation: smoke-test every entry script,
  not just `app`.
- **Named imports from CJS dependencies** rely on `cjs-module-lexer` static
  analysis; a few may need switching to default import + destructuring.
  Found mechanically by running each script and the test suite.
- **Circular imports** behave differently (ESM live bindings vs CJS partial
  exports); any breakage surfaces at startup and is fixed case by case.

## Rollout and verification

Single PR. Definition of done:

1. `npx jest` green in native ESM mode.
2. `npm run lint` passes, including the new extension-enforcement rule.
3. `grunt` build succeeds; `appBuild/` starts via `bin/run`.
4. All six entry scripts (`app`, `worker`, `notifier`, `uploader`,
   `downloader`, `sitemap`) start cleanly in development against the
   docker-compose stack.
5. No `@babel/*` packages remain in `package.json`.

## Out of scope

- Frontend migration (`public/`, RequireJS/AMD → ESM/bundler).
- Dependency upgrades not forced by the migration.
- Replacing Jest with another runner (only as a discussed fallback).

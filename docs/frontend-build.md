# Frontend build

The frontend uses ES modules and esbuild 0.28.2 (the `esbuild-wasm` package).
WASM keeps the existing Docker development bind mount portable when macOS and
Linux share `node_modules`. It is slower than native esbuild, but needs no
platform-specific executable. Server Babel compilation is unchanged.

## Development

Install dependencies as usual and restart the app after updating the tooling.
The development server builds into `public-build/` on startup and serves that
output before the source static directory. For edits without restarting:

```sh
npm run watch:assets
# Or, inside Docker:
docker compose exec app npm run watch:assets
```

The watcher uses an esbuild context and rebuilds incrementally into the existing
`public-build/`, which it clears only once at startup. esbuild polls the JavaScript,
module Pug templates, and LESS sources (including imported LESS files and new files
in `public/style/`), so it also works on Docker bind mounts without file system events.
Only stylesheets whose source or imports changed are recompiled. Build errors are
reported and the watcher keeps running. Restart it after changing `bin/`
configuration, `.browserslistrc`, or static files such as images and fonts. Refresh
the page after a rebuild; there is no hot module replacement. `npm run build:assets`
produces a standalone minified frontend in `public-build/`.

## Production

`npm run build` writes the existing Docker input, `appBuild/`, including
`public/`, transpiled server code, `build.json`, and the static 404 fallback.
It builds the frontend directly into `appBuild/public/` so an open development
server can continue using `public-build/`. Neither production Dockerfile needs
new build steps or runtime frontend dependencies.

The two module-script entry URLs remain `/js/module/appMain.js` and
`/js/module/appAdmin.js`. Entry scripts and common CSS use the application build
hash in their query string. Shared and lazy JavaScript chunks use content hashes
in their filenames. Feature CSS uses a content hash in its URL. Deploy the entire
`public/` tree together, including `js/chunks/`, stylesheet files, fonts, images,
and adjacent JS/CSS source maps.

LESS compiles directly to the output tree, without writing generated CSS into
source directories. Pug module templates compile to HTML strings at build time;
the existing doT rendering remains unchanged. Stylesheet imports create link
elements and await loading before evaluating their dependent feature. Relative
image and font URLs keep their original `/style/` directory layout.

`public/js/_mainConfig.js` now only imports shared initialization. Build aliases
are in `bin/frontend-paths.js`. Application modules use static ES imports and
default exports. `public/js/frontend/lazy.js` is the explicit allowlist of dynamic
imports used by the renderer, editor, upload, and map-provider integrations. Add
new dynamically addressed modules there. Unknown module names reject the loading
promise instead of silently producing an invalid URL. Plugin groups load in order.
The socket module exports its connected socket through top-level await, preserving
the old startup connection barrier.

## Compatibility and limits

- esbuild targets come from `.browserslistrc` via `browserslist-to-esbuild`.
  The frontend requires native module scripts, dynamic import, and top-level
  await (Chrome/Edge/Firefox 89, Safari 15), so the query must not reach below
  those versions. esbuild fails the build if it does. The `BROWSERSLIST`
  environment variable overrides the file for experiments.
- Vendored libraries retain their upstream AMD/UMD sources. A build adapter
  statically imports their dependencies and gives each wrapper an isolated local
  registration function. There is no global `define`, `require`, RequireJS loader,
  r.js optimizer, or separate UglifyJS pass in the browser/build pipeline. Two
  vendored Bootstrap extensions still spell their stylesheet dependency as
  `css!…`; the build adapter converts those to normal stylesheet imports.
- The vendored underscore.string `wrap` helper needed local variable declarations
  because ES modules execute in strict mode. This is a compatibility fix, not an
  intentional behavior change.
- Two vendored libraries carry small local patches for esbuild warnings:
  geocoordsparser uses `Number.isNaN` instead of the always-false `== NaN`, and
  knockout.mapping drops a `typeof … != "array"` clause that was always true.
  Neither changes behaviour PastVu relies on. Keep them when updating either library.
- The unused `m/common/dummy` scaffold still references missing template/style
  files. It is intentionally absent from the lazy allowlist.
- Google/Yandex APIs, API keys, external script failures, and all editor/upload
  server operations require their normal service configuration. No API keys were
  available for smoke testing the external map providers. No files or news were
  published during validation.

## Validation

Validated on 2026-11-15:

- Node version consistency check, ESLint, and Stylelint pass.
- Existing Jest suite: 22 suites, 203 tests pass. On this macOS machine Redis
  6.2.6 fails to compile (`stat64`/`fstat64`); tests pass using
  `REDISMS_SYSTEM_BINARY=/opt/homebrew/bin/redis-server npm run jest -- --ci`.
- `npm run build` passes, with the vendor warnings described above.
- Browser smoke tests against the real `localhost:3000` backend: main map,
  lazy About dialog, authenticated admin dashboard, lazy news editor (including
  Trumbowyg add-ons and date picker), and the photo upload dialog. No JavaScript
  errors.
- Main/About and admin news-editor checks also pass with minified production
  JS/CSS served from `appBuild/public/` through a temporary local static server,
  while keeping HTML, authentication, and Socket.IO on the real backend.

For a manual smoke test, open `/`, `/about`, `/photoUpload`, `/admin`, and
`/admin/news/create` (use the documented development admin account for the latter
pages). Check that feature chunks and content-hashed styles load only when needed,
that the editor and date picker initialize, and that the browser has no global
RequireJS loader. Do not save test news or upload files just to check initialization.

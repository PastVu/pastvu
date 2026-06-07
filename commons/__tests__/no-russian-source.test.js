/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const fs = require('fs');
const path = require('path');

// Regression guard: after the i18n migration, source code holds English keys
// only. This test fails as soon as a Cyrillic character lands in a `.js` or
// `.pug` file outside the curated allowlist — translation source JSONs,
// third-party libs, build output, and a few intentional fixtures. The intent
// is to catch UI strings that bypassed i18n, so we scan only the runtime tree
// (no migrations/, basepatch/, bin/ tooling) and we ignore comments — Cyrillic
// in `//`, `//-`, or `/* */` doesn't reach the user.

const ROOT = path.resolve(__dirname, '../..');
const CYRILLIC = /[Ѐ-ӿ]/;

const ROOTS = [
    'app', 'commons', 'controllers', 'models', 'public/js', 'sitemap', 'views',
    'api.js', 'app.js', 'downloader.js', 'notifier.js', 'sitemap.js',
    'uploader.js', 'worker.js',
];

const EXCLUDE_DIR = [
    /\/node_modules\//, /\/appBuild\//,
    // Vendored libraries under public/js/lib/. Project-owned files in the same
    // directory (Utils.js, Browser.js, JSExtensions.js, PubSub.js) are scanned.
    /\/public\/js\/lib\/(?:bootstrap|highstock|jquery|knockout|leaflet|moment|require|trumbowyg)\//,
    /\/public\/js\/lib\/(?:doT|es6-promise\.min|geocoordsparser|i18next\.min|jsuri|lodash|socket\.io\.min|turf\.min|underscore\.string)\.js\//,
    /\/public\/js\/lang\//, /\/__tests__\/__mocks__\//,
];

// Files we keep but where Cyrillic is by design — test fixtures, the one
// dual-language synthetic region object the server needs at boot, and the
// shared Utils helper that parses Russian Wikipedia coordinate markers
// ("с.ш."/"ю.ш."/"в.д."/"з.д.") out of user input.
const IGNORE_FILES = new Set([
    'commons/__tests__/i18n.test.js',
    'commons/__tests__/Utils.test.js',
    'commons/__tests__/no-russian-source.test.js',
    'controllers/region.js',
    'public/js/lib/Utils.js',
]);

function walk(dir, out) {
    let entries;

    try {
        entries = fs.readdirSync(dir);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return out;
        }

        throw err;
    }

    for (const name of entries) {
        const p = path.join(dir, name);

        if (EXCLUDE_DIR.some(re => re.test(p + '/'))) {
            continue;
        }

        const stat = fs.statSync(p);

        if (stat.isDirectory()) {
            walk(p, out);
        } else if (/\.(js|pug)$/.test(p)) {
            out.push(p);
        }
    }

    return out;
}

// Replace `/* … */` blocks (including JSDoc) with whitespace so line numbers
// stay aligned. Run on the whole file before per-line scanning. Strings
// aren't tracked here — false positives like `'/*'` are rare enough that
// leaving them be is fine.
function stripBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

// Drop a single-line `//` (JS) or `//-` (pug) comment tail. We track string
// quoting so `'http://x'` survives. Pug attribute strings such as
// `data-bind="..."` count as strings too — that keeps `i18n('…')` inside them
// visible to the scan.
function stripLineComment(line) {
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let prevBackslash = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];

        if (prevBackslash) {
            prevBackslash = false;
            continue;
        }

        if (c === '\\') {
            prevBackslash = true;
            continue;
        }

        if (!inDouble && !inBacktick && c === "'") {
            inSingle = !inSingle;
        } else if (!inSingle && !inBacktick && c === '"') {
            inDouble = !inDouble;
        } else if (!inSingle && !inDouble && c === '`') {
            inBacktick = !inBacktick;
        } else if (!inSingle && !inDouble && !inBacktick && c === '/' && line[i + 1] === '/') {
            return line.slice(0, i);
        }
    }

    return line;
}

function collectFiles() {
    const files = [];

    for (const rel of ROOTS) {
        const abs = path.join(ROOT, rel);

        if (!fs.existsSync(abs)) {
            continue;
        }

        const stat = fs.statSync(abs);

        if (stat.isDirectory()) {
            walk(abs, files);
        } else if (/\.(js|pug)$/.test(abs)) {
            files.push(abs);
        }
    }

    return files;
}

function scan(file) {
    const rel = path.relative(ROOT, file);

    if (IGNORE_FILES.has(rel)) {
        return [];
    }

    const raw = fs.readFileSync(file, 'utf8');
    const src = stripBlockComments(raw);
    const lines = src.split('\n');
    const rawLines = raw.split('\n');
    const findings = [];

    lines.forEach((line, i) => {
        const code = stripLineComment(line);

        if (CYRILLIC.test(code)) {
            findings.push(`${rel}:${i + 1}  ${(rawLines[i] || '').trim().slice(0, 120)}`);
        }
    });

    return findings;
}

function collectFindings() {
    return collectFiles().flatMap(scan);
}

describe('no Cyrillic in source', () => {
    it('every .js and .pug file under runtime roots is Cyrillic-free', () => {
        expect(collectFindings()).toStrictEqual([]);
    });
});

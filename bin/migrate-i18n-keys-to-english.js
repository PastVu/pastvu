#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 *
 * One-shot migration: flip i18n keys from Russian source strings to English.
 *
 *   Before: t('Вход')                    en.json: { "Вход": "Login" }
 *                                        ru.json: { ...plurals only... }
 *   After:  t('Login')                   en.json: { ...symbolic keys only... }
 *                                        ru.json: { "Login": "Вход", ...plurals... }
 *
 * The script:
 *   1) Pre-flight — refuses to run if any two Russian source keys share the
 *      same English value in the same namespace (the inversion would collapse
 *      them).
 *   2) Rewrites each en/ru JSON pair: en file keeps only symbolic (non-Cyrillic)
 *      keys; ru file gains { english: russian } entries plus its existing
 *      symbolic plural keys.
 *   3) Rewrites every i18n key string literal in .js and .pug source files,
 *      from the Russian source to the matching English value.
 *
 * JSON files with this layout are migrated:
 *   - public/js/lang/i18n.{en,ru}.json
 *   - views/mail/i18n.{en,ru}.json
 *   - views/status/i18n.{en,ru}.json
 *
 * Symbolic keys (CLDR plurals like 'users_count_one', formatter keys like
 * 'datetime_full') stay symbolic — identified by absence of Cyrillic letters.
 *
 * For .js files, replacement is AST-aware: only the KEY argument of a t()/i18n()
 * (or *.t / *.i18n) call is rewritten — options-object values are left alone.
 * For .pug files, the script does a literal text replacement of 'Russian' /
 * "Russian" occurrences in the source; the only Russian strings that appear in
 * pug-embedded JS expressions are i18n call arguments, so this is safe in this
 * codebase (verified — non-i18n Russian text in pug appears unquoted, in plain
 * text bodies, or as static attribute values that don't match any key).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const CYRILLIC = /[А-Яа-яЁё]/;
const I18N_NAMES = new Set(['i18n', 't']);

const JSON_PAIRS = [
    { en: 'public/js/lang/i18n.en.json', ru: 'public/js/lang/i18n.ru.json' },
    { en: 'views/mail/i18n.en.json',     ru: 'views/mail/i18n.ru.json'     },
    { en: 'views/status/i18n.en.json',   ru: 'views/status/i18n.ru.json'   },
];

const SOURCE_ROOTS = [
    'app', 'commons', 'controllers', 'models', 'public/js', 'views', 'sitemap',
    'tests', 'api.js', 'app.js', 'downloader.js', 'notifier.js', 'sitemap.js',
    'uploader.js', 'worker.js',
];

const EXCLUDE = [
    /\/node_modules\//,
    /\/appBuild\//,
    /\/public\/js\/lib\//,
    /\/public\/js\/lang\//,
    /\.min\.js$/,
];

// -- JSON helpers ------------------------------------------------------------

function readJson(rel) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function writeJson(rel, obj) {
    fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 4) + '\n');
}

function splitByCyrillic(obj) {
    const symbolic = {};
    const russian = {};

    for (const [k, v] of Object.entries(obj)) {
        (CYRILLIC.test(k) ? russian : symbolic)[k] = v;
    }

    return { symbolic, russian };
}

// -- Pre-flight: duplicate English values within a namespace -----------------

function findDuplicates(pairs) {
    const reports = [];

    for (const pair of pairs) {
        const { russian } = splitByCyrillic(readJson(pair.en));
        const byEnglish = new Map();

        for (const [ru, en] of Object.entries(russian)) {
            if (!byEnglish.has(en)) byEnglish.set(en, []);
            byEnglish.get(en).push(ru);
        }

        for (const [en, rus] of byEnglish) {
            if (rus.length > 1) reports.push({ file: pair.en, en, rus });
        }
    }

    return reports;
}

function printDuplicateReport(reports) {
    console.error(`Found ${reports.length} duplicate English value(s):\n`);

    for (const r of reports) {
        console.error(`  ${r.file}`);
        console.error(`    ${JSON.stringify(r.en)}`);

        for (const ru of r.rus) console.error(`      ← ${JSON.stringify(ru)}`);

        console.error('');
    }

    console.error('Make each English value unique in the en.json file (typically by');
    console.error('adding context to one of them), then re-run the script.');
}

// -- Phase: rewrite JSON pairs ----------------------------------------------

function rewriteJsonPair(pair) {
    const en = readJson(pair.en);
    const ru = readJson(pair.ru);
    const { symbolic: enSym, russian: enRu } = splitByCyrillic(en);
    const { symbolic: ruSym, russian: ruDirect } = splitByCyrillic(ru);

    // New en: only symbolic keys (CLDR plurals etc.). For regular keys we rely
    // on i18next returning the key itself when no resource is found.
    const newEn = { ...enSym };

    // New ru: existing symbolic keys + inverted { english: russian } from en.
    const newRu = { ...ruSym };

    // For duplicate English values (synonym collapse), the first Russian source
    // in file order wins — it becomes the canonical translation. Both Russian
    // call sites get migrated to the same English key by the source rewrite.
    for (const [ruKey, enValue] of Object.entries(enRu)) {
        if (newRu[enValue] === undefined) newRu[enValue] = ruKey;
        else if (newRu[enValue] !== ruKey) console.log(`  merge: ${pair.ru} keeps ${JSON.stringify(enValue)} → ${JSON.stringify(newRu[enValue])} (dropped ${JSON.stringify(ruKey)})`);
    }

    // Any non-symbolic entries that were already in ru.json (carried over from a
    // partial run) survive untouched.
    for (const [k, v] of Object.entries(ruDirect)) {
        if (newRu[k] === undefined) newRu[k] = v;
    }

    writeJson(pair.en, newEn);
    writeJson(pair.ru, newRu);
}

// -- Build russian → english map across all namespaces -----------------------

function buildRussianToEnglishMap(pairs) {
    const map = new Map();

    for (const pair of pairs) {
        const { russian } = splitByCyrillic(readJson(pair.en));

        for (const [ru, en] of Object.entries(russian)) {
            if (map.has(ru) && map.get(ru) !== en) {
                console.warn(`  warn: cross-namespace conflict for ${JSON.stringify(ru)}: ${JSON.stringify(map.get(ru))} vs ${JSON.stringify(en)}`);
            }

            map.set(ru, en);
        }
    }

    return map;
}

// -- File walking ------------------------------------------------------------

function walk(dir, out) {
    let entries;

    try {
        entries = fs.readdirSync(dir);
    } catch (err) {
        if (err.code === 'ENOENT') return out;

        throw err;
    }

    for (const name of entries) {
        const p = path.join(dir, name);

        if (EXCLUDE.some(re => re.test(p + '/'))) continue;

        const stat = fs.statSync(p);

        if (stat.isDirectory()) {
            walk(p, out);
        } else if (/\.(js|pug)$/.test(p) && !EXCLUDE.some(re => re.test(p))) {
            out.push(p);
        }
    }

    return out;
}

function collectSourceFiles() {
    const files = [];

    for (const rel of SOURCE_ROOTS) {
        const abs = path.join(ROOT, rel);

        if (!fs.existsSync(abs)) continue;

        const stat = fs.statSync(abs);

        if (stat.isDirectory()) walk(abs, files);
        else if (/\.(js|pug)$/.test(abs)) files.push(abs);
    }

    return files;
}

// -- JS rewrite (AST-aware) --------------------------------------------------

function isI18nCallee(node) {
    if (!node) return false;

    if (node.type === 'Identifier' && I18N_NAMES.has(node.name)) return true;

    if (node.type === 'MemberExpression' && !node.computed &&
        node.property.type === 'Identifier' && I18N_NAMES.has(node.property.name)) {
        return true;
    }

    return false;
}

// A string literal counts as an i18n KEY only when it occupies a positional
// argument slot of a t()/i18n() call. Walking up the AST, we stop at the first
// ancestor that "commits" — either reaching the i18n call (key) or going
// through any node that signals "this is not the key" (object property values,
// array elements, string concatenation, function bodies, etc.).
function isI18nKey(path) {
    let cur = path.parentPath;

    while (cur) {
        const t = cur.node.type;

        if (t === 'CallExpression') {
            return isI18nCallee(cur.node.callee);
        }

        // Pass through these — a string in `t(cond ? 'A' : 'B')` or
        // `t(flag && 'A')` is still the key.
        if (t === 'ConditionalExpression' || t === 'LogicalExpression' ||
            t === 'ParenthesizedExpression' || t === 'SequenceExpression') {
            cur = cur.parentPath;
            continue;
        }

        // Anything else (ObjectProperty, ArrayExpression, BinaryExpression for
        // `'X' + var`, function bodies, …) means this literal isn't the key.
        return false;
    }

    return false;
}

function reEncodeStringLiteral(originalRawOrType, newValue) {
    // Preserve the quote style of the original literal.
    const quote = originalRawOrType[0] === '"' ? '"' : "'";

    return quote +
        newValue.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote) +
        quote;
}

function rewriteJsFile(file, map) {
    const code = fs.readFileSync(file, 'utf8');
    let ast;

    try {
        ast = parser.parse(code, {
            sourceType: 'unambiguous',
            allowReturnOutsideFunction: true,
            errorRecovery: true,
            plugins: ['optionalChaining', 'nullishCoalescingOperator'],
        });
    } catch (err) {
        console.error(`  skip ${path.relative(ROOT, file)} (parse error: ${err.message})`);

        return 0;
    }

    const edits = [];

    traverse(ast, {
        StringLiteral(p) {
            const value = p.node.value;

            if (!CYRILLIC.test(value)) return;

            if (!map.has(value)) return;

            if (!isI18nKey(p)) return;

            const raw = p.node.extra && p.node.extra.raw || JSON.stringify(value);

            edits.push({
                start: p.node.start,
                end: p.node.end,
                replacement: reEncodeStringLiteral(raw, map.get(value)),
            });
        },
    });

    if (!edits.length) return 0;

    edits.sort((a, b) => b.start - a.start);

    let out = code;

    for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);

    fs.writeFileSync(file, out);

    return edits.length;
}

// -- Pug rewrite (literal text replacement) ---------------------------------

function reEscape(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pug attributes whose VALUE is a JS string literal (data-bind="..." being the
// canonical case) get evaluated by pug, then by the consumer (knockout, jQuery).
// Backslash escapes inside the JS string literal are consumed by pug, so an
// apostrophe inside a nested i18n('...') call needs DOUBLE escaping (\\') to
// survive into the rendered HTML.
function isInsideDoubleQuotedPugAttr(code, pos) {
    const lineStart = code.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = code.indexOf('\n', pos);
    const line = code.slice(lineStart, lineEnd === -1 ? code.length : lineEnd);
    const offset = pos - lineStart;
    // Walk the line up to `offset` and track which kind of pug attribute string
    // we're inside, if any. Pug attribute lists are (key="value", key=expr) —
    // we only need to know whether `pos` sits inside a "..."-wrapped value.
    let inDouble = false;
    let prevBackslash = false;

    for (let i = 0; i < offset; i++) {
        const c = line[i];

        if (prevBackslash) { prevBackslash = false; continue; }

        if (c === '\\') { prevBackslash = true; continue; }

        if (c === '"') inDouble = !inDouble;
    }

    return inDouble;
}

function rewritePugFile(file, map) {
    const original = fs.readFileSync(file, 'utf8');
    const edits = [];

    for (const [ru, en] of map) {
        if (!original.includes(ru)) continue;

        const enBase = en.replace(/\\/g, '\\\\');
        const enSingle = enBase.replace(/'/g, "\\'");
        const enSingleNested = enBase.replace(/'/g, "\\\\'"); // for data-bind="..." context
        const enDouble = enBase.replace(/"/g, '\\"');

        const escaped = reEscape(ru);

        for (const re of [new RegExp("'" + escaped + "'", 'g'), new RegExp('"' + escaped + '"', 'g')]) {
            let m;

            while ((m = re.exec(original)) !== null) {
                const isDoubleQuote = m[0][0] === '"';
                let replacement;

                if (isDoubleQuote) replacement = '"' + enDouble + '"';
                else replacement = "'" + (isInsideDoubleQuotedPugAttr(original, m.index) ? enSingleNested : enSingle) + "'";

                edits.push({ start: m.index, end: m.index + m[0].length, replacement });
            }
        }
    }

    if (!edits.length) return 0;

    edits.sort((a, b) => b.start - a.start);

    let out = original;

    for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);

    if (out !== original) fs.writeFileSync(file, out);

    return edits.length;
}

// -- Driver ------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2);
    const checkOnly = args.includes('--check');
    const dryRun = args.includes('--dry-run');
    const merge = args.includes('--merge');

    console.log('=== Pre-flight: duplicate English values ===');

    const dups = findDuplicates(JSON_PAIRS);

    if (dups.length && !merge) {
        printDuplicateReport(dups);
        process.exit(2);
    }

    if (dups.length) {
        console.log(`--merge: collapsing ${dups.length} duplicate English value(s):`);

        for (const r of dups) console.log(`  ${r.file}: ${JSON.stringify(r.en)} ← keeping ${JSON.stringify(r.rus[0])} (dropping ${r.rus.slice(1).map(s => JSON.stringify(s)).join(', ')})`);

        console.log('');
    } else {
        console.log('OK — no duplicates.\n');
    }

    if (checkOnly) {
        console.log('--check only; not modifying anything.');

        return;
    }

    console.log('=== Building russian → english map ===');

    const map = buildRussianToEnglishMap(JSON_PAIRS);

    console.log(`${map.size} entries across ${JSON_PAIRS.length} namespace(s).\n`);

    if (dryRun) {
        console.log('--dry-run; not modifying anything.');
        console.log('Would rewrite JSON pairs:');

        for (const p of JSON_PAIRS) console.log(`  ${p.en}  +  ${p.ru}`);

        console.log(`Would scan ${collectSourceFiles().length} source file(s).`);

        return;
    }

    console.log('=== Rewriting JSON files ===');

    for (const pair of JSON_PAIRS) {
        rewriteJsonPair(pair);
        console.log(`  ${pair.en}  +  ${pair.ru}`);
    }

    console.log('');
    console.log('=== Rewriting source files ===');

    const files = collectSourceFiles();
    let touchedFiles = 0;
    let totalEdits = 0;

    for (const file of files) {
        const n = file.endsWith('.js') ? rewriteJsFile(file, map) : rewritePugFile(file, map);

        if (n > 0) {
            touchedFiles++;
            totalEdits += n;
            console.log(`  ${path.relative(ROOT, file)}  (${n})`);
        }
    }

    console.log('');
    console.log(`Done. Modified ${touchedFiles} of ${files.length} scanned file(s); ${totalEdits} replacement(s).`);
}

main();

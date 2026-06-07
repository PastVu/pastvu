/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Regression guard: every English i18n key called from runtime code must
// resolve to a Russian translation. Mirrors the production i18next config:
// the default namespace is `translation`, the `mail`/`status` namespaces fall
// back to `translation`, and CLDR suffixes apply to plural keys. JS call sites
// are extracted via AST; pug call sites via a small tokeniser.

const ROOT = path.resolve(__dirname, '../..');
const I18N_NAMES = new Set(['i18n', 't']);

const RU = {
    translation: require('../../public/js/lang/i18n.ru.json'),
    mail: require('../../views/mail/i18n.ru.json'),
    status: require('../../views/status/i18n.ru.json'),
};

// Identity entries in the en.json files — keys that the developer marked as
// "rendered the same in both languages" (e.g. 'E-mail:'). Treat these as
// satisfying the completeness requirement even without a ru.json mirror.
const EN = {
    translation: require('../../public/js/lang/i18n.en.json'),
    mail: require('../../views/mail/i18n.en.json'),
    status: require('../../views/status/i18n.en.json'),
};

const ROOTS = [
    'app', 'commons', 'controllers', 'models', 'public/js', 'sitemap', 'views',
    'api.js', 'app.js', 'downloader.js', 'notifier.js', 'sitemap.js',
    'uploader.js', 'worker.js',
];

const EXCLUDE_DIR = [
    /\/node_modules\//, /\/appBuild\//, /\/public\/js\/lib\//,
    /\/public\/js\/lang\//, /\/__mocks__\//, /\/__tests__\//,
];

// CLDR-style symbolic keys are lowercase + underscore, no whitespace.
function isSymbolic(key) {
    return /^[a-z][a-z0-9_]*$/.test(key);
}

function existsIn(bag, key) {
    return Object.prototype.hasOwnProperty.call(bag, key);
}

function resolveExists(key, ns) {
    const ruPrim = RU[ns] || RU.translation;
    const ruFall = RU.translation;
    const enPrim = EN[ns] || EN.translation;
    const enFall = EN.translation;

    if (existsIn(ruPrim, key) || existsIn(ruFall, key)) {
        return true;
    }

    // An identity entry in en.json declares "same in both languages" — count
    // it as translated.
    if (existsIn(enPrim, key) || existsIn(enFall, key)) {
        return true;
    }

    if (!isSymbolic(key)) {
        return false;
    }

    // Plural lookup: every count-driven call needs at least _one and _other,
    // because i18next falls through to _other when no specific bucket matches.
    const hasOne = existsIn(ruPrim, key + '_one') || existsIn(ruFall, key + '_one') ||
        existsIn(enPrim, key + '_one') || existsIn(enFall, key + '_one');
    const hasOther = existsIn(ruPrim, key + '_other') || existsIn(ruFall, key + '_other') ||
        existsIn(enPrim, key + '_other') || existsIn(enFall, key + '_other');

    return hasOne && hasOther;
}

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

// --- JS extraction (AST) ---------------------------------------------------

function isI18nCallee(node) {
    if (!node) {
        return false;
    }

    if (node.type === 'Identifier' && I18N_NAMES.has(node.name)) {
        return true;
    }

    if (node.type === 'MemberExpression' && !node.computed &&
        node.property.type === 'Identifier' && I18N_NAMES.has(node.property.name)) {
        return true;
    }

    return false;
}

function collectKeysFromArg(arg, into) {
    if (!arg) {
        return;
    }

    if (arg.type === 'StringLiteral') {
        into.push(arg.value);

        return;
    }

    if (arg.type === 'ConditionalExpression') {
        collectKeysFromArg(arg.consequent, into);
        collectKeysFromArg(arg.alternate, into);

        return;
    }

    if (arg.type === 'LogicalExpression') {
        collectKeysFromArg(arg.left, into);
        collectKeysFromArg(arg.right, into);
    }
}

// Pull out positional string-literal keys (including ConditionalExpression
// branches) and, when the trailing arg is an ObjectExpression with `ns: '…'`,
// the namespace string. We accept both the client `i18n(key, opts)` shape and
// the server `t(lang, key, opts)` shape — for the latter, arg 1 holds the key.
function extractFromCall(node) {
    const out = [];
    const args = node.arguments;

    if (!args || !args.length) {
        return out;
    }

    let ns = 'translation';

    if (args.length >= 2 && args[args.length - 1].type === 'ObjectExpression') {
        for (const prop of args[args.length - 1].properties) {
            const isIdentNs = prop.key.type === 'Identifier' && prop.key.name === 'ns';
            const isStringNs = prop.key.type === 'StringLiteral' && prop.key.value === 'ns';
            const matchesKey = prop.type === 'ObjectProperty' && (isIdentNs || isStringNs) &&
                prop.value.type === 'StringLiteral';

            if (matchesKey) {
                ns = prop.value.value;
            }
        }
    }

    const keys = [];

    collectKeysFromArg(args[0], keys);

    for (const k of keys) {
        // Suppress lang literals — these are arg 0 of `t(lang, key, opts)`,
        // not translation keys.
        if (k === 'en' || k === 'ru') {
            continue;
        }

        out.push({ key: k, ns });
    }

    if (args.length >= 2 && args[1].type !== 'ObjectExpression') {
        const keys2 = [];

        collectKeysFromArg(args[1], keys2);

        for (const k of keys2) {
            out.push({ key: k, ns });
        }
    }

    return out;
}

function extractFromJs(file) {
    const code = fs.readFileSync(file, 'utf8');
    let ast;

    try {
        ast = parser.parse(code, {
            sourceType: 'unambiguous',
            allowReturnOutsideFunction: true,
            errorRecovery: true,
            plugins: ['optionalChaining', 'nullishCoalescingOperator'],
        });
    } catch {
        return [];
    }

    const calls = [];

    traverse(ast, {
        CallExpression(p) {
            if (!isI18nCallee(p.node.callee)) {
                return;
            }

            for (const c of extractFromCall(p.node)) {
                calls.push({ ...c, file, line: p.node.loc && p.node.loc.start.line });
            }
        },
    });

    return calls;
}

// --- Pug extraction (tokenised) -------------------------------------------

function unescapeJs(s) {
    return s.replace(/\\(.)/g, (_, c) => c);
}

function splitTopLevelArgs(body) {
    const out = [];
    let i = 0;
    let depth = 0;
    let start = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;

    while (i < body.length) {
        const c = body[i];

        if (c === '\\') {
            i += 2;
            continue;
        }

        if (!inDouble && !inBacktick && c === "'") {
            inSingle = !inSingle;
        } else if (!inSingle && !inBacktick && c === '"') {
            inDouble = !inDouble;
        } else if (!inSingle && !inDouble && c === '`') {
            inBacktick = !inBacktick;
        } else if (!inSingle && !inDouble && !inBacktick) {
            if (c === '(' || c === '{' || c === '[') {
                depth++;
            } else if (c === ')' || c === '}' || c === ']') {
                depth--;
            } else if (c === ',' && depth === 0) {
                out.push(body.slice(start, i));
                start = i + 1;
            }
        }

        i++;
    }

    out.push(body.slice(start));

    return out;
}

// Walk the call's argument body from the opening paren to the matching close,
// tracking string/template quoting so we don't mistake a `)` inside a string
// for the end of the call.
function readCallBody(code, openIdx) {
    let depth = 1;
    let i = openIdx + 1;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;

    while (i < code.length && depth > 0) {
        const c = code[i];

        if (c === '\\') {
            i += 2;
            continue;
        }

        if (!inDouble && !inBacktick && c === "'") {
            inSingle = !inSingle;
        } else if (!inSingle && !inBacktick && c === '"') {
            inDouble = !inDouble;
        } else if (!inSingle && !inDouble && c === '`') {
            inBacktick = !inBacktick;
        } else if (!inSingle && !inDouble && !inBacktick) {
            if (c === '(') {
                depth++;
            } else if (c === ')') {
                depth--;
            }
        }

        i++;
    }

    return depth === 0 ? code.slice(openIdx + 1, i - 1) : null;
}

// Extract every quoted string literal from a fragment of pug-embedded JS. We
// don't try to identify which one is "the key" — when a ternary picks between
// two strings, both need translations. Strings used as RHS of `==`/`===` are
// comparison values (e.g. `status() === 'denied' ? 'X' : 'Y'`), not keys.
function pullStringLiterals(body) {
    const out = [];
    let i = 0;

    while (i < body.length) {
        const c = body[i];

        if (c === '\\') {
            i += 2;
            continue;
        }

        if (c === "'" || c === '"') {
            const quote = c;
            let j = i + 1;

            while (j < body.length) {
                if (body[j] === '\\') {
                    j += 2;
                    continue;
                }

                if (body[j] === quote) {
                    break;
                }

                j++;
            }

            const prev = body.slice(0, i).trimEnd();
            const isComparisonValue = /[=]{2,3}\s*$/.test(prev);

            if (!isComparisonValue) {
                out.push(unescapeJs(body.slice(i + 1, j)));
            }

            i = j + 1;

            continue;
        }

        i++;
    }

    return out;
}

const PUG_OPEN = /\b(?:t|i18n)\s*\(/g;

function extractFromPug(file) {
    const code = fs.readFileSync(file, 'utf8');
    const calls = [];
    let m = PUG_OPEN.exec(code);

    while (m !== null) {
        const open = m.index + m[0].length - 1;
        const body = readCallBody(code, open);

        if (body !== null) {
            // Split into top-level arguments — commas inside string/template/brace
            // contexts don't count.
            const args = splitTopLevelArgs(body);
            const keyArg = args[0] || '';
            const keys = pullStringLiterals(keyArg);
            const rest = args.slice(1).join(',');
            const nsMatch = rest.match(/\bns\s*:\s*['"]([^'"]+)['"]/);
            const ns = nsMatch ? nsMatch[1] : 'translation';
            const line = code.slice(0, m.index).split('\n').length;

            for (const key of keys) {
                calls.push({ key, ns, file, line });
            }
        }

        m = PUG_OPEN.exec(code);
    }

    return calls;
}

function collectMissing() {
    const files = collectFiles();
    const calls = files.flatMap(f => f.endsWith('.js') ? extractFromJs(f) : extractFromPug(f));
    const missing = new Map();

    for (const { key, ns, file, line } of calls) {
        const isInterpOnly = /^\s*\{\{[^}]+\}\}\s*$/.test(key);

        if (isInterpOnly || resolveExists(key, ns)) {
            continue;
        }

        const id = `${ns}:${key}`;

        if (!missing.has(id)) {
            missing.set(id, { ns, key, locations: [] });
        }

        missing.get(id).locations.push(`${path.relative(ROOT, file)}:${line}`);
    }

    return [...missing.values()];
}

function formatMissing(missing) {
    return missing.map(m => `[${m.ns}] ${JSON.stringify(m.key.slice(0, 100))} @ ${m.locations.slice(0, 3).join('  ')}`);
}

describe('i18n completeness', () => {
    it('every English key called from code has a Russian translation', () => {
        const missing = collectMissing();

        expect(formatMissing(missing)).toStrictEqual([]);
    });
});

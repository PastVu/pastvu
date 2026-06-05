#!/usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const CYRILLIC = /[Ѐ-ӿ]/;
const I18N_NAMES = new Set(['i18n', 't']);

const DEFAULT_ROOTS = ['public/js'];
const EXCLUDE = [
    /\/lib\//,
    /\/i18n\.js$/,
    /\/_mainConfig\.js$/,
    /\/node_modules\//,
    /\.min\.js$/,
];

function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const stat = fs.statSync(p);

        if (stat.isDirectory()) {
            walk(p, out);
        } else if (p.endsWith('.js') && !EXCLUDE.some(re => re.test(p))) {
            out.push(p);
        }
    }

    return out;
}

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

function isInsideI18nCall(path) {
    let cur = path.parentPath;

    while (cur) {
        if (cur.node.type === 'CallExpression' && isI18nCallee(cur.node.callee)) {
            return true;
        }

        cur = cur.parentPath;
    }

    return false;
}

function isConsoleCall(path) {
    let cur = path.parentPath;

    while (cur) {
        if (cur.node.type === 'CallExpression') {
            const callee = cur.node.callee;

            if (callee.type === 'MemberExpression' && !callee.computed &&
                callee.object.type === 'Identifier' && callee.object.name === 'console') {
                return true;
            }
        }

        cur = cur.parentPath;
    }

    return false;
}

function shouldIgnoreContext(path) {
    const parent = path.parent;

    if (!parent) {
        return false;
    }

    // require('...') / import paths — never have Cyrillic, but cheap to skip.
    if (parent.type === 'CallExpression' && parent.callee.type === 'Identifier' &&
        (parent.callee.name === 'require' || parent.callee.name === 'define')) {
        return parent.arguments.includes(path.node);
    }

    // Regex-like patterns built from string literals — usually not user-facing.
    if (parent.type === 'NewExpression' && parent.callee.type === 'Identifier' &&
        parent.callee.name === 'RegExp') {
        return true;
    }

    return false;
}

function templateText(node) {
    return node.quasis.map(q => q.value.cooked).join('${...}');
}

function trim(s, max = 80) {
    const clean = s.replace(/\s+/g, ' ').trim();

    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function scanFile(file, findings) {
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
        findings.push({ file, line: 0, col: 0, text: `[parse error: ${err.message}]` });

        return;
    }

    traverse(ast, {
        StringLiteral(path) {
            const value = path.node.value;

            if (!CYRILLIC.test(value)) {
                return;
            }

            if (isInsideI18nCall(path) || isConsoleCall(path) || shouldIgnoreContext(path)) {
                return;
            }

            findings.push({
                file,
                line: path.node.loc.start.line,
                col: path.node.loc.start.column + 1,
                text: trim(value),
            });
        },
        TemplateLiteral(path) {
            const text = templateText(path.node);

            if (!CYRILLIC.test(text)) {
                return;
            }

            if (isInsideI18nCall(path) || isConsoleCall(path)) {
                return;
            }

            findings.push({
                file,
                line: path.node.loc.start.line,
                col: path.node.loc.start.column + 1,
                text: '`' + trim(text) + '`',
            });
        },
    });
}

function main() {
    const args = process.argv.slice(2);
    const roots = args.length ? args : DEFAULT_ROOTS;
    const files = [];

    for (const root of roots) {
        const abs = path.resolve(root);

        if (!fs.existsSync(abs)) {
            console.error(`skip (not found): ${root}`);
            continue;
        }

        const stat = fs.statSync(abs);

        if (stat.isDirectory()) {
            walk(abs, files);
        } else if (abs.endsWith('.js')) {
            files.push(abs);
        }
    }

    const findings = [];

    for (const file of files) {
        scanFile(file, findings);
    }

    const cwd = process.cwd();
    const byFile = new Map();

    for (const f of findings) {
        const rel = path.relative(cwd, f.file);

        if (!byFile.has(rel)) {
            byFile.set(rel, []);
        }

        byFile.get(rel).push(f);
    }

    for (const [rel, items] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
        for (const it of items) {
            console.log(`${rel}:${it.line}:${it.col}  ${it.text}`);
        }
    }

    console.error('');
    console.error(`scanned ${files.length} file(s), found ${findings.length} untranslated string(s)`);
    process.exit(findings.length ? 1 : 0);
}

main();

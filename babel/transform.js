#! /usr/bin/env node
/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const colors = require('ansi-colors');
const babel = require('@babel/core');
const parseArgv = require('../commons/parseArgv');

const help = `
  Transforms script with Babel using application's config.
  Usage: transform.js -f <file> [-c <config>] [-o <out>]

  By default transpiles script for server. Use -c to specify another config.

    -f, --file    File to transform (required)
    -c, --config  Babel config (default: ./server.config.js)
    -o, --out     Output file (omit to print to stdout)
    --help        Show this help`;

const argv = {
    config: path.join(__dirname, 'server.config.js'),
    ...parseArgv({ aliases: { c: 'config', f: 'file', o: 'out' } }),
};

if (argv.help) {
    console.log(help);
    process.exit(0);
}

if (!argv.file) {
    console.error('Missing required option: -f / --file. Run with --help.');
    process.exit(1);
}

if (!fs.existsSync(argv.file)) {
    throw new Error(`File "${argv.file}" doesn't exist`);
}

const input = fs.readFileSync(argv.file, 'utf8');
const config = require(path.resolve(argv.config));
const start = Date.now();
const output = babel.transform(input, config);
const end = Date.now() - start;
const inputSize = Buffer.byteLength(input, 'utf8');
const outputSize = Buffer.byteLength(output.code, 'utf8');

/* eslint no-console:0 */
if (argv.out) {
    fs.writeFileSync(argv.out, output.code);
    console.log(colors.green(`File "${argv.file}" transpiled into "${argv.out}"`));
} else {
    console.log(output.code);
    console.log('---------');
}

console.log(
    `time: ${colors.yellow(`${end}ms`)},`,
    `inputSize: ${colors.yellow(inputSize)}, outputSize: ${colors.yellow(outputSize)}\n`,
    `config: ${colors.yellow(argv.config)}\n`,
    `usedHelpers: ${_.map(output.metadata.usedHelpers, helper => colors.yellow(helper)).join(', ') || '—'}`
);

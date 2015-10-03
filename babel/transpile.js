#! /usr/bin/env node
'use strict';

const fs = require('fs');
const format = require('util').format;
const desc = `
  Transpiles script with Babel using application's config.
  Usage: $0 <file> [options]

  By default transpiles script for server (node.js).
  Use -c option to transpile for client (browser).`;

let srcFilePath;
const argv = require('yargs')
    .usage(desc, {
        client: {
            describe: 'Transpile script for client (browser)',
            alias: 'c',
            boolean: true,
            default: false
        },
        out: {
            describe: 'File to save transpiled script into',
            alias: 'o',
            string: true
        }
    })
    .required(1, 'Provide file to transpile')
    .check(function (argv) {
        srcFilePath = argv._[0];
        if (!fs.existsSync(srcFilePath)) {
            throw new Error(format('File "%s" not exists', srcFilePath));
        }

        return true;
    })
    .help('help')
    .strict()
    .showHelpOnFail(false, 'Run with `--help` to see usage example')
    .argv;

const babel = require('babel-core');
const src = fs.readFileSync(srcFilePath);
const babelConfig = argv.client ? require('./client.config') : require('./server.config');
const code = babel.transform(src, babelConfig).code;
const outputFile = argv.out;

if (outputFile) {
    fs.writeFileSync(outputFile, code);
    console.log(format('File "%s" transpiled into "%s"', srcFilePath, outputFile));
} else {
    console.log(code);
}
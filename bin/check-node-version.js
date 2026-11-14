/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const expected = require('../package.json').engines.node;

for (const filename of ['.node-version', '.nvmrc', '.docker/Dockerfile', '.docker/backend.Dockerfile']) {
    const content = fs.readFileSync(path.join(root, filename), 'utf8');
    const actual = filename.endsWith('Dockerfile') ? content.match(/^ARG NODE_TAG=(.*)$/m)?.[1].trim() : content.trim();

    if (actual !== expected) {
        console.error(`Version defined in ${filename} (${actual || 'missing'}) is not matching package version of node (${expected}).`);
        process.exitCode = 1;
    }
}

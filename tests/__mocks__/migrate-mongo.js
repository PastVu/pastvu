/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Stub for migrate-mongo used in the Jest environment.
//
// migrate-mongo@14 is ESM-only and its CommonJS wrapper relies on dynamic import(),
// which Jest's CommonJS VM cannot execute without --experimental-vm-modules. The real
// module is never used during tests because database migration checks are skipped when
// NODE_ENV === 'test' (see controllers/connection.js). This stub mirrors the shape of the
// API consumed by controllers/migration.js so the import resolves without side effects.

const notSupported = () => {
    throw new Error('migrate-mongo is stubbed in the test environment and must not be called.');
};

export const config = { set: notSupported };
export const database = { connect: notSupported };
export const status = notSupported;
export const up = notSupported;

export default { config, database, status, up };

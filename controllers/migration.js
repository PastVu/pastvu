import log4js from 'log4js';
import ms from 'ms';
import migrate from 'migrate-mongo';
import migrateConfig from '../config/migrate-mongo';

const logger = log4js.getLogger('migrate-mongo');
const maxMigrationWaitTime = ms('120s');

/**
 * List migrations that have not been applied (pending).
 *
 * @returns {string[]}
 */
async function listPendingMigrations() {
    migrate.config.set(migrateConfig);

    const { db, client } = await migrate.database.connect();
    const migrationStatus = await migrate.status(db);

    await client.close();

    return migrationStatus.filter(item => item.appliedAt === 'PENDING').map(item => item.fileName);
}

/**
 * Perform migration.
 */
async function migrateUp() {
    migrate.config.set(migrateConfig);
    logger.info('Running database migration...');

    const { db, client } = await migrate.database.connect();
    const migrated = await migrate.up(db, client);

    migrated.forEach(fileName => logger.info('Migrated: ', fileName));
    await client.close();
}


/**
 * Check pending migrations.
 *
 * This logs number of pending magirations at warn level and optinally
 * migrates up.
 *
 * @param {boolean} migrate Whether to perform migration.
 * @returns {boolean} false if migration is required, true if migratiion is not needed or was completed.
 */
export async function checkPendingMigrations(migrate = false) {
    const items = await listPendingMigrations();

    if (items.length) {
        logger.warn(`${items.length} pending database migrations (${items.join(', ')})`);

        if (migrate) {
            await migrateUp();
        } else {
            logger.warn('Waiting for migration to complete...');

            return waitForMigration();
        }
    } else {
        logger.info('No pending database migrations');
    }

    return true;
}

/**
 * Wait for migration to complete.
 *
 * This is used to suspend app instance loading till migration is completed
 * (normally by worker instance).
 *
 * @returns {Promise} Resolves as true if migration has been completed, false if not.
 */
async function waitForMigration() {
    return new Promise(resolve => {
        const delay = ms('5s');
        let totalRetryTime = 0;
        const retry = async () => {
            const items = await listPendingMigrations();

            if (items.length === 0) {
                // Migration has been completed.
                resolve(true);
            } else if (totalRetryTime > maxMigrationWaitTime) {
                // Give up waiting.
                resolve(false);
            } else {
                // Check migration after delay.
                totalRetryTime += delay;
                setTimeout(retry, delay);
            }
        };

        retry();
    });
}

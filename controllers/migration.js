import log4js from 'log4js';
import migrate from 'migrate-mongo';
import migrateConfig from '../config/migrate-mongo';

const logger = log4js.getLogger('migrate-mongo');

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
 * Log pending migrations number at warn level.
 */
export function logPendingMigrations() {
    listPendingMigrations().then(items => {
        if (items.length) {
            logger.warn(`${items.length} pending database migrations (${items.join(', ')})`);
        } else {
            logger.info('No pending database migrations');
        }
    });
}

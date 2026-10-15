import cron from 'node-cron';
import { prisma } from './prisma';
import { syncZkData, syncAllDeviceClocks } from '../../modules/devices/zk';
import { syncScheduler } from '../../modules/system/syncScheduler';
import { timeSyncScheduler } from '../../modules/system/timeSyncScheduler';
import { healthCheckScheduler } from '../../modules/system/healthCheckScheduler';
import { logBufferMaintenanceScheduler } from '../../modules/system/logBufferMaintenanceScheduler';
import { backupScheduler } from '../../modules/system/backupScheduler';
import { autoCloseIncompleteAttendance, autoCheckoutEmployees } from '../../modules/attendance/attendance.service';

/**
 * Ensure the default SyncConfig record (id: 1) exists in the database
 */
async function ensureDefaultSyncConfig() {
    try {
        await prisma.syncConfig.upsert({
            where: { id: 1 },
            update: {},
            create: {
                id: 1,
                globalSyncEnabled: true,
                defaultIntervalSec: 30,
                highFreqIntervalSec: 30,
                lowFreqIntervalSec: 600,
                shiftAwareSyncEnabled: false,
                shiftBufferMinutes: 120,
                nightShiftBufferMinutes: 120,
                autoTimeSyncEnabled: true,
                timeSyncIntervalSec: 3600,
                dbBackupEnabled: false,
                dbBackupCron: '0 0 * * *',
                dbBackupRetention: 7,
                dbBackupCompress: true,
            },
        });
    } catch (err) {
        console.warn('[SyncConfig] Failed to ensure default sync config:', err);
    }
}

/**
 * Initialize all cron jobs for automated attendance tracking
 */
export const startCronJobs = () => {
    console.log('[CronJobs] Initializing automated jobs...');

    // Ensure system configuration exists before schedulers read it
    void ensureDefaultSyncConfig();

    // Job 1: Sync attendance logs from ZKTeco device
    // Uses the new dynamic SyncScheduler instead of hardcoded node-cron
    syncScheduler.start();

    // Job 2: Auto-close incomplete attendance records at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[CronJob] Running midnight cleanup...');
        try {
            const closedCount = await autoCloseIncompleteAttendance();
            console.log(`[CronJob] Cleanup completed: ${closedCount} records marked incomplete`);
        } catch (error) {
            console.error('[CronJob] Cleanup error:', error);
        }
    });


    // Job 3: REMOVED — Auto-checkout has been permanently disabled.
    // Missing checkouts are now flagged by Job 2 for manual review.

    // Job 4: Sync all ZK device clocks to server PHT time
    // Managed by dynamic timeSyncScheduler (configurable interval)
    timeSyncScheduler.start();

    // Job 5: Independent device health monitoring (TCP ping)
    // Runs on its own timer, completely independent of data sync
    healthCheckScheduler.start();

    // Job 6: Scheduled device log buffer maintenance (daily / weekly / monthly)
    // Prevents device flash memory from filling up without the data-loss race
    // condition of wiping inline during every 30s sync cycle.
    void logBufferMaintenanceScheduler.start();

    // Job 7: Automatic database backup scheduler (configurable cron)
    void backupScheduler.start();

    console.log('[CronJobs] ✓ Periodic sync scheduled (every 30 seconds, skips when device is busy)');
    console.log('[CronJobs] ✓ Midnight cleanup scheduled (00:00 daily)');
    console.log('[CronJobs] ✓ Hourly device clock sync scheduled (top of every hour)');
    console.log('[CronJobs] ✓ Device health monitor started (configurable interval)');
    console.log('[CronJobs] ✓ Log buffer maintenance scheduler started (configurable schedule)');
    console.log('[CronJobs] ✓ Database backup scheduler started (configurable cron)');
};



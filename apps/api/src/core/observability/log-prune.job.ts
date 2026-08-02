import { logger } from "../utils/logger.js";
import { LOG_RETENTION_DAYS, pruneOldLogs } from "./app-log.service.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes log rows past the retention window, once a day.
 *
 * The pattern to copy for other jobs: run once at boot (a container that restarts daily
 * would otherwise never reach the first interval), then on a timer, and `unref()` so the
 * timer never keeps the process alive on shutdown.
 */
export function startLogPruneJob() {
    const run = async () => {
        try {
            const deleted = await pruneOldLogs();
            if (deleted > 0) {
                logger.info("log-prune", `${deleted} log rows older than ${LOG_RETENTION_DAYS}d deleted`);
            }
        } catch (err) {
            logger.error("log-prune", "prune failed", err);
        }
    };

    void run();
    setInterval(() => void run(), INTERVAL_MS).unref();
}

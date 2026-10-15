import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./core/config/env.js";
import { pool } from "./core/db/client.js";
import { startLogPruneJob } from "./core/observability/log-prune.job.js";
import { closeQueues } from "./core/queue/queue.js";
import { initWebSocketServer } from "./core/realtime/ws.js";
import { redis } from "./core/redis/client.js";
import { logger } from "./core/utils/logger.js";
import { startExampleWorker } from "./modules/example/index.js";

// Bootstrap: the HTTP server, the WebSocket server sharing its port, the scheduled jobs and
// the queue workers.
const app = createApp();
const server = createServer(app);

initWebSocketServer(server);
startLogPruneJob();

// Queue workers — one line per module that processes a queue.
startExampleWorker();

server.listen(env.PORT, () => {
    logger.info("boot", `api listening on :${env.PORT}`);
});

/**
 * `docker stop` sends SIGTERM and kills the process 10s later. In that window: stop taking
 * requests, let the workers finish the jobs they are running, then close the connections that
 * would otherwise keep the process alive. Order matters — a job still running needs Redis
 * and the DB until its worker has closed.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("boot", `${signal} received, shutting down`);

    // Open WebSockets would keep close() from ever calling back, so it is not awaited.
    server.close();
    // A job that hangs must not hold the container past the deadline.
    setTimeout(() => process.exit(1), 9_000).unref();

    try {
        await closeQueues();
        await redis.quit();
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

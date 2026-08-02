import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./core/config/env.js";
import { startLogPruneJob } from "./core/observability/log-prune.job.js";
import { initWebSocketServer } from "./core/realtime/ws.js";
import { logger } from "./core/utils/logger.js";

// Bootstrap: the HTTP server, the WebSocket server sharing its port, and the scheduled jobs.
const app = createApp();
const server = createServer(app);

initWebSocketServer(server);
startLogPruneJob();

server.listen(env.PORT, () => {
    logger.info("boot", `api listening on :${env.PORT}`);
});

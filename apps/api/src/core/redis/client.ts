import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * One general-purpose connection for whatever a feature needs directly — a cache entry, a lock,
 * a counter. The counterpart of `db` in core/db/client.ts.
 *
 * BullMQ does NOT use this client: queues and workers open their own connections from the
 * same REDIS_URL (see core/queue/queue.ts), because a worker blocks its connection while it
 * waits for jobs and must not share it with anything else.
 */
export const redis = new Redis(env.REDIS_URL);
redis.on("error", (err) => logConnectionError("redis", err));

const LOG_EVERY_MS = 60_000;
const lastLogged = new Map<string, number>();

/**
 * ioredis reconnects on its own and emits `error` on every failed attempt — several times a
 * second while Redis is down. Logged at most once a minute per source, since `logger.error`
 * also writes a row to app_logs.
 */
export function logConnectionError(scope: string, err: unknown) {
    const now = Date.now();
    if (now - (lastLogged.get(scope) ?? 0) < LOG_EVERY_MS) return;
    lastLogged.set(scope, now);
    logger.error(scope, "connection error", err);
}

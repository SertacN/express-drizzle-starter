import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db } from "../db/client.js";
import { redis } from "../redis/client.js";

/**
 * Deliberately hits the database and Redis: a container that answers 200 while its pool is
 * dead is worse than one that fails, because the orchestrator keeps routing traffic to it.
 * Redis counts too — without it no job can be enqueued. A failure simply throws, so
 * errorHandler answers 500 and the reason goes to the log only.
 */
export const check: RequestHandler = async (_req, res) => {
    await Promise.all([db.execute(sql`select 1`), redis.ping()]);
    res.json({ status: "ok", db: "ok", redis: "ok", timestamp: new Date().toISOString() });
};

import { lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { appLogs } from "../db/schema/index.js";

/**
 * The WRITE side of logging — infrastructure, called from every layer (logger, requestLog).
 * The read side (an admin "logs" page) belongs to a module: core must not depend on one.
 */

/**
 * Anything slower than this counts as slow and is logged even when it SUCCEEDED.
 * 1s was noisy; a request over 3s is genuinely abnormal and is the only data that makes
 * "the site feels slow" comparable over time.
 */
export const SLOW_REQUEST_MS = 3000;

/** Retention: rows carry IP and user-agent, so they are not kept forever. */
export const LOG_RETENTION_DAYS = 14;

/** Error message + short stack; truncated so one bad loop cannot bloat the table. */
const MAX_ERROR_LENGTH = 2000;

export interface RecordRequestInput {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    userId: string | null;
    ip: string | null;
    userAgent: string | null;
    errorMessage: string | null;
}

export interface RecordEventInput {
    level: "error" | "warn";
    /** Job or service name — 'boot', 'log-prune', 'upload'… */
    scope: string;
    message: string;
    errorMessage: string | null;
}

/** Called without awaiting — logging must neither delay nor fail the request. */
export async function recordRequest(input: RecordRequestInput): Promise<void> {
    await insert({
        source: "http",
        level: input.status >= 500 ? "error" : "warn",
        ...input,
        path: input.path.slice(0, 500),
        userAgent: input.userAgent?.slice(0, 500) ?? null,
    });
}

/** Events outside the request cycle — see core/utils/logger.ts. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
    await insert({
        source: "job",
        level: input.level,
        scope: input.scope.slice(0, 60),
        message: input.message.slice(0, 500),
        errorMessage: input.errorMessage,
    });
}

async function insert(values: Record<string, unknown>) {
    try {
        await db.insert(appLogs).values({
            ...values,
            errorMessage:
                typeof values.errorMessage === "string" ? values.errorMessage.slice(0, MAX_ERROR_LENGTH) : null,
        } as typeof appLogs.$inferInsert);
    } catch (err) {
        // CAREFUL: no logger here. The logger tries to write errors to the DB, and we are in
        // this branch precisely because the DB write failed — that would be an infinite loop.
        console.error("[app-log] could not write log row:", err);
    }
}

/** Deletes rows past the retention window; returns how many went. */
export async function pruneOldLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await db.delete(appLogs).where(lte(appLogs.createdAt, cutoff)).returning({ id: appLogs.id });
    return deleted.length;
}

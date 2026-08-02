import { recordEvent } from "../observability/app-log.service.js";

/**
 * Logging for events OUTSIDE the request cycle — scheduled jobs, startup, background work.
 *
 * Writes to two places:
 *  - one JSON line on stdout (so `docker logs` and any collector can parse it),
 *  - `warn`/`error` additionally into `app_logs`, so a job that has been failing for weeks
 *    leaves a trace you can actually query.
 *
 * `info` is deliberately not persisted: routine "deleted N rows" lines would bloat the table.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, message: string, err?: unknown) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : err ? String(err) : null;

    // Single-line JSON — a multi-line stack trace would be split by log collectors.
    const line = JSON.stringify({
        t: new Date().toISOString(),
        level,
        scope,
        message,
        ...(detail ? { detail } : {}),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);

    if (level === "info") return;
    // Not awaited: writing a log must neither delay nor fail the caller.
    void recordEvent({ level, scope, message, errorMessage: detail });
}

export const logger = {
    info: (scope: string, message: string) => emit("info", scope, message),
    warn: (scope: string, message: string, err?: unknown) => emit("warn", scope, message, err),
    error: (scope: string, message: string, err?: unknown) => emit("error", scope, message, err),
};

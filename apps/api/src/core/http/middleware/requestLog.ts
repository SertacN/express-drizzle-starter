import type { NextFunction, Request, Response } from "express";
import { recordRequest, SLOW_REQUEST_MS } from "../../observability/app-log.service.js";

declare global {
    namespace Express {
        interface Request {
            /** errorHandler writes here on a 5xx; the finish handler carries it into the log row. */
            logErrorMessage?: string;
        }
    }
}

/**
 * A request with an expired access token returns 401 and the client silently refreshes and
 * retries. That is BY DESIGN, not a failure: every open tab produces 401s all day and logging
 * them would bury the real errors.
 *
 * Two exceptions stay: both are security events and both are rare.
 *  - 401 on /login   -> a failed sign-in attempt (brute-force trail)
 *  - 401 on /refresh -> the session really ended, or a family was revoked as stolen
 */
function isRoutineTokenExpiry(status: number, path: string): boolean {
    if (status !== 401) return false;
    return !path.endsWith("/login") && !path.endsWith("/refresh");
}

/**
 * Records the requests worth looking at: FAILED (status >= 400) or SLOW (>= SLOW_REQUEST_MS).
 *
 * Successful fast requests write nothing, which is why this costs almost nothing — inserting
 * on every request would wire the hottest path straight into the database.
 */
export function requestLog(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
        const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
        // The query string is dropped on purpose (tokens and passwords end up there).
        const path = req.originalUrl.split("?")[0] ?? req.originalUrl;
        const isError = res.statusCode >= 400;
        const isSlow = durationMs >= SLOW_REQUEST_MS;
        if (!isError && !isSlow) return;
        if (isRoutineTokenExpiry(res.statusCode, path)) return;

        void recordRequest({
            method: req.method,
            path,
            status: res.statusCode,
            durationMs,
            userId: req.auth?.userId ?? null,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            errorMessage: req.logErrorMessage ?? null,
        });
    });

    next();
}

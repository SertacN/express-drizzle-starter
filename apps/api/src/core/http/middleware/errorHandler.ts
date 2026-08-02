import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/**
 * The only error type services should throw. `message` is a stable error CODE
 * (clients translate it); free-form text from an external system goes into `detail`.
 */
export class HttpError extends Error {
    status: number;
    detail?: string;

    constructor(status: number, message: string, detail?: string) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

/**
 * Express 5 forwards rejected async handlers here automatically — controllers never
 * need their own try/catch.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
    if (err instanceof ZodError) {
        res.status(400).json({ error: "validation_error", issues: err.issues });
        return;
    }
    if (err instanceof HttpError) {
        res.status(err.status).json({
            error: err.message,
            ...(err.detail ? { detail: err.detail } : {}),
        });
        return;
    }
    // Not the logger: requestLog persists this row via logErrorMessage below, and calling
    // logger.error here would write the same event to the table twice. stdout only.
    console.error(err);
    // requestLog's finish handler picks this up, so the log row shows WHY the 500 happened.
    req.logErrorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err);
    res.status(500).json({ error: "internal_server_error" });
}

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOrigins } from "./core/config/env.js";
import { errorHandler } from "./core/http/middleware/errorHandler.js";
import { defaultRateLimit } from "./core/http/middleware/rateLimit.js";
import { requestLog } from "./core/http/middleware/requestLog.js";
import { UPLOADS_URL_PREFIX, uploadsRoot } from "./core/storage/storage.service.js";
import { apiRouter } from "./router.js";

export function createApp() {
    const app = express();

    // Runs behind exactly one proxy hop (production: Traefik, dev: the Vite proxy) — required
    // for rate limiting to read the real client IP from X-Forwarded-For.
    app.set("trust proxy", 1);

    app.use(helmet());
    app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : true }));

    // Uploaded files, mounted BEFORE the rate limiter: one page can request dozens of images
    // and those must not eat the API budget. The filename changes on every upload (content is
    // never updated in place), which makes immutable caching safe.
    app.use(
        UPLOADS_URL_PREFIX,
        express.static(uploadsRoot(), {
            index: false,
            dotfiles: "deny",
            maxAge: "1y",
            immutable: true,
            // helmet defaults to same-origin; images may be embedded from another origin.
            setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
        }),
    );

    // After the static mount: image traffic should not fill the log, the API is what matters.
    app.use(requestLog);

    app.use(express.json());
    app.use(defaultRateLimit);

    app.use("/api/v1", apiRouter);

    // Last, always: Express 5 routes rejected async handlers here.
    app.use(errorHandler);

    return app;
}

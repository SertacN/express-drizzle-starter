import rateLimit from "express-rate-limit";

/** Applies to every route; individual routers add stricter limits on top. */
export const defaultRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
});

/** Login/register: guessable targets, so the window is long and the budget small. */
export const authRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
});

// Refresh is not a guessable target: every open tab refreshes once per access-token lifetime
// (15 min) and a whole office leaves through one NAT IP. The login limit would cut legitimate
// traffic here, and a 429 signs the user out — hence a separate, wider window.
export const refreshRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

/** Uploads mean megabytes plus sharp CPU time; the default 120/min is far too generous. */
export const uploadRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

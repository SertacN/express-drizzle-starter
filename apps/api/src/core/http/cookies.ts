/**
 * Express parses no cookies on its own and the WebSocket upgrade never reaches a middleware,
 * so both ends read the header through this one function instead of pulling in cookie-parser.
 *
 * Values are percent-encoded by `res.cookie()`, so they are decoded back here.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
    const jar: Record<string, string> = {};
    if (!header) return jar;

    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq < 1) continue;
        const name = part.slice(0, eq).trim();
        // A repeated name keeps the FIRST value: that is the most specific path the browser
        // sent, and picking the other one would silently use a stale cookie.
        if (name in jar) continue;
        try {
            jar[name] = decodeURIComponent(part.slice(eq + 1).trim());
        } catch {
            // A malformed escape is not worth a 500 — treat the cookie as absent.
        }
    }
    return jar;
}

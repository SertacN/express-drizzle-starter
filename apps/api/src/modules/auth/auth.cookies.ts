import type { CookieOptions, Response } from "express";
import { ACCESS_TOKEN_COOKIE, type AuthTokens, REFRESH_TOKEN_COOKIE } from "shared";
import { env } from "../../core/config/env.js";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "../../core/utils/jwt.js";

/** Where the refresh cookie is sent back: only the routes that rotate or revoke it. */
const REFRESH_COOKIE_PATH = "/api/v1/auth/web";

function baseOptions(): CookieOptions {
    return {
        // The whole point of the scheme: JavaScript cannot read these, so an XSS bug cannot
        // walk off with the session.
        httpOnly: true,
        // Over plain HTTP in development the browser would drop a Secure cookie entirely.
        secure: env.NODE_ENV === "production",
        // "lax" still sends the cookie on top-level navigations (an email link back into the
        // app) while blocking the cross-site POSTs that CSRF needs.
        sameSite: "lax",
    };
}

/** The one place cookies are written, so no handler can forget an attribute. */
export function setAuthCookies(res: Response, tokens: AuthTokens): void {
    const options = baseOptions();

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
        ...options,
        path: "/",
        maxAge: ACCESS_TOKEN_TTL_MS,
    });

    // Scoped to the web auth routes: no other endpoint has any reason to receive it, and a
    // cookie that is not sent cannot leak in a log or a proxy.
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
        ...options,
        path: REFRESH_COOKIE_PATH,
        maxAge: REFRESH_TOKEN_TTL_MS,
    });
}

/**
 * Path and the other attributes must match what was set, or the browser keeps the original
 * cookie alongside the cleared one and the user stays signed in.
 */
export function clearAuthCookies(res: Response): void {
    const options = baseOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, { ...options, path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { ...options, path: REFRESH_COOKIE_PATH });
}

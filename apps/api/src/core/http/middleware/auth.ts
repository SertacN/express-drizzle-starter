import type { NextFunction, Request, Response } from "express";
import { ACCESS_TOKEN_COOKIE, type UserRole } from "shared";
import { verifyAccessToken } from "../../utils/jwt.js";
import { parseCookies } from "../cookies.js";

export interface AuthContext {
    userId: string;
    role: UserRole;
}

declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
        }
    }
}

/**
 * Two transports, one gate. The `Authorization: Bearer` header is how the API is used by
 * default (and the only thing a mobile app can send); the access cookie is what a browser on
 * the `/auth/web/*` surface has. Whichever arrives, the identity comes from the SAME signed
 * token — so every guarded route below serves both audiences without knowing which it is.
 */
function readAccessToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
    return parseCookies(req.headers.cookie)[ACCESS_TOKEN_COOKIE];
}

/** Rejects anything without a valid access token; downstream handlers can trust `req.auth`. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = readAccessToken(req);
    if (!token) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    try {
        const payload = verifyAccessToken(token);
        req.auth = { userId: payload.sub, role: payload.role };
        next();
    } catch {
        res.status(401).json({ error: "unauthorized" });
    }
}

/**
 * Role gate. Mount AFTER requireAuth — the role comes from the token, never from the request
 * body. Roles are cached in the token for up to 15 minutes; a demotion takes effect on the
 * next refresh, which is the trade for not hitting the DB on every request.
 */
export function requireRole(...roles: UserRole[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.auth) {
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        if (!roles.includes(req.auth.role)) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        next();
    };
}

import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "shared";
import { verifyAccessToken } from "../../utils/jwt.js";

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

/** Rejects anything without a valid access token; downstream handlers can trust `req.auth`. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    try {
        const payload = verifyAccessToken(header.slice("Bearer ".length));
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

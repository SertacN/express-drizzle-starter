import jwt from "jsonwebtoken";
import type { UserRole } from "shared";
import { env } from "../config/env.js";

const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AccessPayload {
    sub: string; // user id
    role: UserRole;
}

// jti = refresh_tokens.id — refresh tokens are tracked in the DB (rotation + reuse detection).
export interface RefreshPayload extends AccessPayload {
    jti: string;
}

function sign(payload: object, type: "access" | "refresh", secret: string, ttlSeconds: number) {
    return jwt.sign({ ...payload, type }, secret, { expiresIn: ttlSeconds });
}

function verify<T extends object>(token: string, type: "access" | "refresh", secret: string): T {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { type?: string };
    // A refresh token must never be accepted where an access token is expected, even if the
    // two secrets are accidentally set to the same value.
    if (decoded.type !== type) throw new Error("unexpected_token_type");
    if (type === "refresh" && !decoded.jti) throw new Error("missing_jti");
    return decoded as T;
}

export function signAccessToken(payload: AccessPayload): string {
    return sign(payload, "access", env.JWT_ACCESS_SECRET, ACCESS_TOKEN_TTL_S);
}

export function signRefreshToken(payload: RefreshPayload): string {
    return sign(payload, "refresh", env.JWT_REFRESH_SECRET, REFRESH_TOKEN_TTL_MS / 1000);
}

export function verifyAccessToken(token: string): AccessPayload {
    return verify<AccessPayload>(token, "access", env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token: string): RefreshPayload {
    return verify<RefreshPayload>(token, "refresh", env.JWT_REFRESH_SECRET);
}

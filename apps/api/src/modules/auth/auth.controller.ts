import type { RequestHandler } from "express";
import {
    REFRESH_TOKEN_COOKIE,
    loginSchema,
    profileUpdateSchema,
    refreshSchema,
    registerSchema,
} from "shared";
import { parseCookies } from "../../core/http/cookies.js";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { clearAuthCookies, setAuthCookies } from "./auth.cookies.js";
import * as authService from "./auth.service.js";

// Controllers do three things and nothing else: parse input with zod, call the service,
// shape the response. No try/catch — Express 5 sends rejections to errorHandler.

export const register: RequestHandler = async (req, res) => {
    const input = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(input));
};

export const login: RequestHandler = async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json(await authService.login(input.email, input.password));
};

export const refresh: RequestHandler = async (req, res) => {
    const input = refreshSchema.parse(req.body);
    res.json(await authService.refreshSession(input.refreshToken));
};

export const logout: RequestHandler = async (req, res) => {
    const input = refreshSchema.parse(req.body);
    await authService.logout(input.refreshToken);
    res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
    res.json(await authService.getProfile(req.auth!.userId));
};

export const updateMe: RequestHandler = async (req, res) => {
    const input = profileUpdateSchema.parse(req.body);
    res.json(await authService.updateOwnProfile(req.auth!.userId, input));
};

// ---- web (httpOnly cookies) -----------------------------------------------------------
// The same service and the same rows; only the transport differs. A browser gets the pair as
// cookies it cannot read, so an XSS bug cannot walk off with the session — which means the
// tokens must NEVER be in these response bodies. What comes back is only who you now are.
//
// `me` is not duplicated: it issues no tokens, and requireAuth already accepts the cookie.

export const registerWeb: RequestHandler = async (req, res) => {
    const input = registerSchema.parse(req.body);
    const session = await authService.register(input);
    setAuthCookies(res, session);
    res.status(201).json({ user: session.user });
};

export const loginWeb: RequestHandler = async (req, res) => {
    const input = loginSchema.parse(req.body);
    const session = await authService.login(input.email, input.password);
    setAuthCookies(res, session);
    res.json({ user: session.user });
};

export const refreshWeb: RequestHandler = async (req, res) => {
    // No zod here: the token is a cookie, not user input, and there is no body to validate.
    const refreshToken = parseCookies(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) throw new HttpError(401, "invalid_refresh_token");

    const session = await authService.refreshSession(refreshToken);
    setAuthCookies(res, session);
    res.json({ user: session.user });
};

/** Unauthenticated on purpose: signing out must work even with a dead access cookie. */
export const logoutWeb: RequestHandler = async (req, res) => {
    await authService.logout(parseCookies(req.headers.cookie)[REFRESH_TOKEN_COOKIE] ?? "");
    clearAuthCookies(res);
    res.status(204).end();
};

export const updateMeWeb: RequestHandler = async (req, res) => {
    const input = profileUpdateSchema.parse(req.body);
    const result = await authService.updateOwnProfile(req.auth!.userId, input);
    // Only a password change issues a new pair — and it just revoked the old one, so the
    // cookies have to be replaced or this very browser is signed out 15 minutes from now.
    if (result.tokens) setAuthCookies(res, result.tokens);
    res.json({ user: result.user });
};

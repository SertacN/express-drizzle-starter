import type { RequestHandler } from "express";
import { loginSchema, profileUpdateSchema, refreshSchema, registerSchema } from "shared";
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

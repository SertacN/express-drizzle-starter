import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { authRateLimit, refreshRateLimit } from "../../core/http/middleware/rateLimit.js";
import * as authController from "./auth.controller.js";

/**
 * Routes only map path -> handler and attach middleware. Guards live here so that reading
 * one file tells you exactly which endpoints are public.
 */
export const authRouter = Router();

// Public, anonymous — strict limits.
authRouter.post("/register", authRateLimit, authController.register);
authRouter.post("/login", authRateLimit, authController.login);
authRouter.post("/refresh", refreshRateLimit, authController.refresh);
authRouter.post("/logout", authController.logout);

// Requires a valid access token.
authRouter.get("/me", requireAuth, authController.me);
authRouter.patch("/me", requireAuth, authController.updateMe);

import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { authRateLimit, refreshRateLimit } from "../../core/http/middleware/rateLimit.js";
import * as authController from "./auth.controller.js";

/**
 * The browser half of the auth surface, split BY FILE the way `public.routes.ts` splits the
 * example module. Same service, same rate limits as the Bearer routes — the only difference
 * is that the pair goes out as httpOnly cookies instead of in the body.
 *
 * `GET /auth/me` stays on the Bearer router: requireAuth reads the cookie too, so duplicating
 * it here would buy nothing.
 */
export const webAuthRouter = Router();

// Public, anonymous — strict limits.
webAuthRouter.post("/register", authRateLimit, authController.registerWeb);
webAuthRouter.post("/login", authRateLimit, authController.loginWeb);
webAuthRouter.post("/refresh", refreshRateLimit, authController.refreshWeb);
webAuthRouter.post("/logout", authController.logoutWeb);

// Requires a valid access token — cookie or Bearer.
webAuthRouter.patch("/me", requireAuth, authController.updateMeWeb);

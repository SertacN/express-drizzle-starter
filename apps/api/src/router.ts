import { Router } from "express";
import { healthRouter } from "./core/http/health.routes.js";
import { requireAuth } from "./core/http/middleware/auth.js";
import { authRouter, webAuthRouter } from "./modules/auth/index.js";
import { exampleRouter, publicExampleRouter } from "./modules/example/index.js";
import { uploadRouter } from "./modules/uploads/index.js";

/**
 * The entire HTTP surface in one file, grouped by audience.
 *
 * What separates the groups is not the folder but the GUARD: a route wired to the wrong
 * audience is only visible here, so mounts are never scattered across modules.
 * Adding a module = one import + one mount line.
 */
export const apiRouter = Router();

apiRouter.use(healthRouter);

// ---- anonymous ---------------------------------------------------------------------
// No token. Every route below must carry its own rate limit and return trimmed payloads.
// The more specific mount goes first: /auth/web/* is the cookie surface for browsers,
// /auth/* is the Bearer one every other client uses.
apiRouter.use("/auth/web", webAuthRouter);
apiRouter.use("/auth", authRouter); // login/register are public by nature; /me guards itself
apiRouter.use("/public/examples", publicExampleRouter);

// ---- authenticated -----------------------------------------------------------------
apiRouter.use("/examples", requireAuth, exampleRouter);
apiRouter.use("/uploads", requireAuth, uploadRouter);

// ---- admin-only --------------------------------------------------------------------
// Same token universe, higher bar. Example:
// apiRouter.use("/admin/users", requireAuth, requireRole("admin"), adminUsersRouter);

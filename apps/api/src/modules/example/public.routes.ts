import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as exampleController from "./example.controller.js";

/**
 * When one module serves more than one audience, the HTTP surface is split BY FILE while the
 * service and the schema stay single copies. This is the anonymous half: no token, so a
 * dedicated rate limit is mandatory and the payload is trimmed in the service.
 */
const publicReadRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
});

export const publicExampleRouter = Router();

publicExampleRouter.get("/", publicReadRateLimit, exampleController.listPublished);

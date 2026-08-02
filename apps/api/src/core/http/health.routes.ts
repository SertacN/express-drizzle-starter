import { Router } from "express";
import * as healthController from "./health.controller.js";

export const healthRouter = Router();

healthRouter.get("/health", healthController.check);

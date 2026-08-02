import { Router } from "express";
import * as exampleController from "./example.controller.js";

/**
 * Authenticated surface. `requireAuth` is attached where this router is mounted
 * (see router.ts), so every handler below can rely on `req.auth`.
 */
export const exampleRouter = Router();

exampleRouter.get("/", exampleController.list);
exampleRouter.post("/", exampleController.create);
exampleRouter.get("/:id", exampleController.get);
exampleRouter.patch("/:id", exampleController.update);
exampleRouter.delete("/:id", exampleController.remove);

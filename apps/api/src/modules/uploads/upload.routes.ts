import { Router } from "express";
import { uploadRateLimit } from "../../core/http/middleware/rateLimit.js";
import { uploadSingleImage } from "../../core/http/middleware/upload.js";
import * as uploadController from "./upload.controller.js";

export const uploadRouter = Router();

// The returned URL is not tied to any row yet — whoever uploads is responsible for saving it
// into a column. Files that never get referenced stay on disk; add a sweeper job if that
// becomes a problem.
uploadRouter.post("/image", uploadRateLimit, uploadSingleImage, uploadController.uploadImage);

import type { RequestHandler } from "express";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { storeImage } from "./upload.service.js";

export const uploadImage: RequestHandler = async (req, res) => {
    if (!req.file) throw new HttpError(400, "file_required");
    res.status(201).json({ url: await storeImage(req.auth!.userId, req.file) });
};

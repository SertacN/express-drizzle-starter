import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "shared";
import { HttpError } from "./errorHandler.js";

const acceptedImages = new Set<string>(ACCEPTED_IMAGE_TYPES);

// Kept in memory: the file is re-encoded by sharp anyway, so the raw bytes never touch disk.
const imageHandler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    fileFilter: (_req, file, cb) => {
        if (!acceptedImages.has(file.mimetype)) {
            cb(new HttpError(415, "unsupported_image_type"));
            return;
        }
        cb(null, true);
    },
}).single("file");

/** Translates multer's own error class into HttpError so errorHandler needn't know multer. */
function wrap(handler: typeof imageHandler) {
    return (req: Request, res: Response, next: NextFunction) => {
        handler(req, res, (err: unknown) => {
            if (err instanceof multer.MulterError) {
                next(
                    err.code === "LIMIT_FILE_SIZE"
                        ? new HttpError(413, "file_too_large")
                        : new HttpError(400, "invalid_upload"),
                );
                return;
            }
            next(err);
        });
    };
}

export const uploadSingleImage = wrap(imageHandler);

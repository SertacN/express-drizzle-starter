import sharp from "sharp";
import { STORED_IMAGE_EXTENSION } from "shared";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { saveFile } from "../../core/storage/storage.service.js";

/** Anything larger is downscaled — nobody needs a 6000px original on a web page. */
const MAX_DIMENSION = 1600;

/**
 * Re-encodes an uploaded image to WebP and stores it under the user's scope.
 *
 * Re-encoding is not only about size: it strips EXIF (location data!) and guarantees the
 * bytes on disk really are an image, whatever the client claimed the MIME type was.
 */
export async function storeImage(userId: string, file: Express.Multer.File): Promise<string> {
    let data: Buffer;
    try {
        data = await sharp(file.buffer)
            .rotate() // apply the EXIF orientation before it gets stripped
            .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    } catch {
        throw new HttpError(400, "invalid_image");
    }

    return saveFile(userId, "image", STORED_IMAGE_EXTENSION, data);
}

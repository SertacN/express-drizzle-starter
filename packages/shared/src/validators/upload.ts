// Upload limits live in shared so the browser can reject a file before spending the round trip
// and the API can enforce the same number. One source of truth.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** Everything is re-encoded to WebP on the server, so the stored extension is always this. */
export const STORED_IMAGE_EXTENSION = "webp";

export interface UploadResult {
    url: string;
}

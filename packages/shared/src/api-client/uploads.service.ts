import type { UploadResult } from "../validators/upload.js";
import type { RequestFn } from "./http.js";

export function createUploadsService(request: RequestFn) {
    return {
        /** Returns the public URL of the stored (re-encoded WebP) image. */
        image: (file: File | Blob) => {
            const form = new FormData();
            form.append("file", file);
            return request<UploadResult>("/api/v1/uploads/image", { method: "POST", body: form });
        },
    };
}

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * The ONLY code that touches the disk. Moving to object storage (S3/R2) means rewriting this
 * file and nothing else — callers only ever see a URL.
 *
 * Files are grouped by `scope`, a caller-chosen directory name (here: the owner's user id).
 * Every read/delete re-derives the path from the scope, so a forged URL cannot reach another
 * scope's files.
 */

/** Public path prefix these files are served under (see app.ts). */
export const UPLOADS_URL_PREFIX = "/api/uploads";

/** Root for express.static. */
export function uploadsRoot(): string {
    return env.UPLOAD_DIR;
}

/** The only names we generate: `<prefix>-<24 hex>.<ext>`. Reads and deletes verify it. */
const FILE_NAME_PATTERN = /^[a-z]+-[0-9a-f]{24}\.[a-z0-9]+$/;

/**
 * Writes data into the scope's directory under a unique name and returns its public URL.
 * The name changes on every upload, which is what makes the files safe to cache immutably.
 */
export async function saveFile(scope: string, prefix: string, extension: string, data: Buffer): Promise<string> {
    const dir = path.join(uploadsRoot(), scope);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${prefix}-${randomBytes(12).toString("hex")}.${extension}`;
    await fs.writeFile(path.join(dir, fileName), data);
    return `${UPLOADS_URL_PREFIX}/${scope}/${fileName}`;
}

/** Reads a stored file back. Returns null for a URL that does not belong to this scope. */
export async function readFile(scope: string, url: string): Promise<Buffer | null> {
    const fileName = resolveFileName(scope, url);
    if (!fileName) return null;
    try {
        return await fs.readFile(path.join(uploadsRoot(), scope, fileName));
    } catch {
        return null;
    }
}

/**
 * Deletes the old file when a column moves to a new value. Silently does nothing if the URL
 * is not one of this scope's files (an external URL, another scope's path, a made-up name),
 * so callers do not have to validate first. A failed delete never fails the request: the file
 * is unreferenced either way, at worst it wastes disk.
 */
export async function deleteFile(scope: string, url: string | null | undefined): Promise<void> {
    const fileName = url ? resolveFileName(scope, url) : null;
    if (!fileName) return;
    try {
        await fs.rm(path.join(uploadsRoot(), scope, fileName), { force: true });
    } catch (err) {
        logger.warn("storage", `could not delete file: ${url}`, err);
    }
}

function resolveFileName(scope: string, url: string): string | null {
    const expectedPrefix = `${UPLOADS_URL_PREFIX}/${scope}/`;
    if (!url.startsWith(expectedPrefix)) return null;
    const fileName = url.slice(expectedPrefix.length);
    return FILE_NAME_PATTERN.test(fileName) ? fileName : null;
}

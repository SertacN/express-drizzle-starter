import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/core/config or dist/core/config -> repo root (same depth either way).
dotenv.config({ path: path.resolve(here, "../../../../../.env"), quiet: true });

/**
 * Every environment variable the API reads, in one schema. Parsing happens at import time:
 * a misconfigured deploy fails loudly at boot instead of at the first request that needs
 * the missing value.
 */
const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
        PORT: z.coerce.number().default(3000),
        DATABASE_URL: z.string().min(1),
        JWT_ACCESS_SECRET: z.string().min(1),
        JWT_REFRESH_SECRET: z.string().min(1),
        /** Comma-separated allowed browser origins. Empty reflects any origin — dev only. */
        CORS_ORIGIN: z.string().default(""),
        /** Root of uploaded files. In production this points at a persistent volume. */
        UPLOAD_DIR: z.string().min(1).default(path.resolve(here, "../../../../../uploads")),
    })
    .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
        message: "JWT secrets must differ — access and refresh token universes stay separate",
    });

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

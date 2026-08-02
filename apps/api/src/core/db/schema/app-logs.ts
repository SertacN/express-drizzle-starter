import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const logSource = pgEnum("log_source", ["http", "job"]);
export const logLevel = pgEnum("log_level", ["warn", "error"]);

/**
 * One table for both kinds of trouble: failed/slow HTTP requests (source `http`) and
 * background events (source `job`). Successful fast requests write nothing — see
 * core/observability/app-log.service.ts for why.
 */
export const appLogs = pgTable(
    "app_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        source: logSource("source").notNull(),
        level: logLevel("level").notNull(),

        // http rows
        method: text("method"),
        path: text("path"),
        status: integer("status"),
        durationMs: integer("duration_ms"),
        userId: uuid("user_id"),
        ip: text("ip"),
        userAgent: text("user_agent"),

        // job rows
        scope: text("scope"),
        message: text("message"),

        errorMessage: text("error_message"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    // Pruning and the "latest errors" view both scan by time, newest first.
    (table) => [index("app_logs_created_at_idx").on(table.createdAt)],
);

export type AppLog = typeof appLogs.$inferSelect;

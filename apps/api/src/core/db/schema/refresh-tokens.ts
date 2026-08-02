import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Refresh token rotation + reuse detection:
// - Every token is a row (id = the JWT's jti). On refresh, used_at is stamped and a new row opens.
// - If a token with used_at set comes back, it is treated as stolen -> the whole family_id is revoked.
// - family_id groups one login session; logout revokes the family in one shot.
export const refreshTokens = pgTable(
    "refresh_tokens",
    {
        id: uuid("id").primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        familyId: uuid("family_id").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true }),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("refresh_tokens_family_id_idx").on(table.familyId)],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;

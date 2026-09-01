import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { USER_ROLES } from "shared";

// The role list is declared in shared (frontends need it too) and reused here, so the enum
// and the client-side type can never drift apart.
export const userRole = pgEnum("user_role", USER_ROLES);

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("user"),
    // The account switch, not a soft-delete flag: a disabled account fails login with
    // account_disabled. Users are never removed — rows elsewhere reference this id.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { EXAMPLE_STATUSES } from "shared";
import { users } from "./users.js";

export const exampleStatus = pgEnum("example_status", EXAMPLE_STATUSES);

/** Sample resource — owned by a user, soft-deletable, with a status. Delete once real tables exist. */
export const examples = pgTable(
    "examples",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        body: text("body"),
        status: exampleStatus("status").notNull().default("draft"),
        imageUrl: text("image_url"),
        isActive: boolean("is_active").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    // The list endpoint always filters by owner; without this it is a full scan.
    (table) => [index("examples_user_id_idx").on(table.userId)],
);

export type Example = typeof examples.$inferSelect;
export type NewExample = typeof examples.$inferInsert;

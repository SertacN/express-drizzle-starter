import { z } from "zod";

// A complete, boring resource. Copy this file (and modules/example) when adding a real one.

export const EXAMPLE_STATUSES = ["draft", "published", "archived"] as const;
export type ExampleStatus = (typeof EXAMPLE_STATUSES)[number];

// The shape both schemas are built from. Kept default-free on purpose — see below.
const exampleFields = z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5000).optional(),
    status: z.enum(EXAMPLE_STATUSES),
});

export const exampleCreateSchema = exampleFields.extend({
    status: z.enum(EXAMPLE_STATUSES).default("draft"),
});

/**
 * Every field optional, but at least one must be present — an empty PATCH is a client bug.
 *
 * Deliberately NOT `exampleCreateSchema.partial()`: that carries the `.default("draft")`
 * along, so a PATCH that only touches the title parses as `status: "draft"` and silently
 * unpublishes the row. A partial-update schema must never contain defaults.
 */
export const exampleUpdateSchema = exampleFields
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const exampleListQuerySchema = z.object({
    // Query strings are always text; coerce before validating the range.
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(EXAMPLE_STATUSES).optional(),
});

export type ExampleCreateInput = z.infer<typeof exampleCreateSchema>;
export type ExampleUpdateInput = z.infer<typeof exampleUpdateSchema>;
export type ExampleListQuery = z.infer<typeof exampleListQuerySchema>;

export interface Example {
    id: string;
    userId: string;
    title: string;
    body: string | null;
    status: ExampleStatus;
    imageUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ExampleList {
    items: Example[];
    total: number;
    page: number;
    perPage: number;
}

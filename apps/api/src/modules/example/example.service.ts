import { and, count, desc, eq } from "drizzle-orm";
import type { ExampleCreateInput, ExampleListQuery, ExampleUpdateInput } from "shared";
import { db } from "../../core/db/client.js";
import { examples } from "../../core/db/schema/index.js";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { deleteFile } from "../../core/storage/storage.service.js";

/**
 * The ONLY layer that talks to the database for this module. Controllers never build queries
 * and other modules never reach past index.ts to get here.
 */

export async function listExamples(userId: string, query: ExampleListQuery) {
    // Ownership is part of every filter — a row is never reachable by id alone.
    const where = and(
        eq(examples.userId, userId),
        eq(examples.isActive, true),
        ...(query.status ? [eq(examples.status, query.status)] : []),
    );

    const [items, [totals]] = await Promise.all([
        db
            .select()
            .from(examples)
            .where(where)
            .orderBy(desc(examples.createdAt))
            .limit(query.perPage)
            .offset((query.page - 1) * query.perPage),
        db.select({ value: count() }).from(examples).where(where),
    ]);

    return { items, total: totals?.value ?? 0, page: query.page, perPage: query.perPage };
}

export async function getExample(userId: string, id: string) {
    const [row] = await db
        .select()
        .from(examples)
        .where(and(eq(examples.id, id), eq(examples.userId, userId), eq(examples.isActive, true)))
        .limit(1);
    // 404 rather than 403 for someone else's row: the answer must not reveal that it exists.
    if (!row) throw new HttpError(404, "example_not_found");
    return row;
}

export async function createExample(userId: string, input: ExampleCreateInput) {
    const [row] = await db
        .insert(examples)
        .values({
            userId,
            title: input.title,
            body: input.body ?? null,
            status: input.status,
        })
        .returning();
    return row!;
}

export async function updateExample(userId: string, id: string, input: ExampleUpdateInput) {
    // Runs first so a foreign id fails with 404 before anything is written.
    await getExample(userId, id);

    const [row] = await db
        .update(examples)
        .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            updatedAt: new Date(),
        })
        .where(eq(examples.id, id))
        .returning();
    return row!;
}

/**
 * Deactivate instead of delete: history and anything referencing this row survive.
 * The uploaded image is a real file though, so it does get removed.
 */
export async function deactivateExample(userId: string, id: string) {
    const row = await getExample(userId, id);
    await db.update(examples).set({ isActive: false, updatedAt: new Date() }).where(eq(examples.id, id));
    await deleteFile(userId, row.imageUrl);
}

/** Anonymous surface: published rows only, no owner filter, deliberately small. */
export function listPublishedExamples() {
    return db
        .select({
            id: examples.id,
            title: examples.title,
            body: examples.body,
            imageUrl: examples.imageUrl,
            createdAt: examples.createdAt,
        })
        .from(examples)
        .where(and(eq(examples.status, "published"), eq(examples.isActive, true)))
        .orderBy(desc(examples.createdAt))
        .limit(50);
}

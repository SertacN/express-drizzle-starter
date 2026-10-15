import { and, count, desc, eq } from "drizzle-orm";
import type { ExampleCreateInput, ExampleListQuery, ExampleUpdateInput } from "shared";
import { db } from "../../core/db/client.js";
import { examples } from "../../core/db/schema/index.js";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { deleteFile } from "../../core/storage/storage.service.js";
import { ExampleJob, exampleQueue } from "./example.queue.js";

/**
 * The ONLY layer that talks to the database for this module. Controllers never build queries
 * and other modules never reach past index.ts to get here.
 */

export async function listExamples(userId: string, query: ExampleListQuery) {
    // Ownership is part of every filter — a row is never reachable by id alone.
    const where = and(
        eq(examples.userId, userId),
        eq(examples.isDeleted, false),
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
        .where(and(eq(examples.id, id), eq(examples.userId, userId), eq(examples.isDeleted, false)))
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
    if (row!.status === "published") await enqueuePublished(userId, row!.id);
    return row!;
}

export async function updateExample(userId: string, id: string, input: ExampleUpdateInput) {
    // Runs first so a foreign id fails with 404 before anything is written.
    const current = await getExample(userId, id);

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
    // Only the transition into `published` triggers the job, not every save of a published row.
    if (row!.status === "published" && current.status !== "published") {
        await enqueuePublished(userId, id);
    }
    return row!;
}

/**
 * Soft delete rather than a real one: history and anything referencing this row survive.
 * The uploaded image is a real file though, so it does get removed.
 */
export async function softDeleteExample(userId: string, id: string) {
    const row = await getExample(userId, id);
    await db
        .update(examples)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(examples.id, id));
    await deleteFile(userId, row.imageUrl);
}

/**
 * Enqueued AFTER the row is committed, so the worker can never pick up an id that does not
 * exist yet. The flip side: if Redis is down the request fails although the row is saved.
 * When losing a job is not acceptable, write it to an outbox table in the same transaction
 * and enqueue from there instead.
 */
async function enqueuePublished(userId: string, exampleId: string) {
    await exampleQueue.add(ExampleJob.Published, { userId, exampleId });
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
        .where(and(eq(examples.status, "published"), eq(examples.isDeleted, false)))
        .orderBy(desc(examples.createdAt))
        .limit(50);
}

import type { Job } from "bullmq";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import { createWorker } from "../../core/queue/queue.js";
import { broadcastToUser } from "../../core/realtime/ws.js";
import { EXAMPLE_QUEUE, ExampleJob, type ExamplePublishedJobData } from "./example.queue.js";
import { getExample } from "./example.service.js";

/**
 * The worker for this module's queue, started from index.ts.
 *
 * A worker is NOT a second data layer: it reads and writes through the service, like a
 * controller does. And it must be idempotent — a job is retried after a failure (or a crash
 * mid-run), so running it twice must not do the work twice.
 */
export function startExampleWorker() {
    // One queue, several job names: dispatch on the name. An unknown one fails loudly instead
    // of being marked completed without anything having run.
    return createWorker<ExamplePublishedJobData>(EXAMPLE_QUEUE, async (job) => {
        switch (job.name) {
            case ExampleJob.Published:
                return handlePublished(job);
            default:
                throw new Error(`unknown_job: ${job.name}`);
        }
    });
}

/**
 * A stand-in for the real work (notify followers, render a preview, call a webhook…). It
 * re-reads the row because the job carries ids only — and the row may have changed or
 * disappeared since it was enqueued.
 */
async function handlePublished(job: Job<ExamplePublishedJobData>) {
    const { userId, exampleId } = job.data;
    try {
        const row = await getExample(userId, exampleId);
        if (row.status !== "published") return;
        broadcastToUser(userId, "example.published", { id: row.id, title: row.title });
    } catch (err) {
        // Deleted in the meantime: nothing left to do, and retrying will not bring it back.
        if (err instanceof HttpError && err.status === 404) return;
        throw err;
    }
}

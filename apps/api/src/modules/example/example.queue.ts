import { createQueue } from "../../core/queue/queue.js";

/**
 * The module's queue contract: the name, every job it carries (typed), and the queue itself.
 * Producer (example.service.ts) and consumer (example.worker.ts) both import from here, so a
 * job name or payload field cannot drift between the two.
 */
export const EXAMPLE_QUEUE = "example";

export const ExampleJob = {
    Published: "published",
} as const;

/**
 * Ids, not the row: the job may run minutes later or on a retry, and the worker must act on
 * the row as it is THEN. `userId` travels with it because ownership is part of every query,
 * in a worker too.
 */
export interface ExamplePublishedJobData {
    userId: string;
    exampleId: string;
}

export const exampleQueue = createQueue<ExamplePublishedJobData>(EXAMPLE_QUEUE);

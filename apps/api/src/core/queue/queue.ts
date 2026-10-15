import { Queue, Worker, type DefaultJobOptions, type Processor, type WorkerOptions } from "bullmq";
import { env } from "../config/env.js";
import { logConnectionError } from "../redis/client.js";
import { logger } from "../utils/logger.js";

/**
 * BullMQ wiring, configured once. This file owns NO queue: each module declares its own in
 * `<name>.queue.ts` with createQueue() and processes it in `<name>.worker.ts` with
 * createWorker() — a queue belongs to the module whose work it carries, exactly like a table.
 */
const connection = { url: env.REDIS_URL };

/**
 * Applied to every job unless the `add()` call overrides it. Retries are on by default: a job
 * usually talks to something that can fail transiently (mail, a third-party API), and a job
 * that must not be retried is the exception that says so.
 */
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    // Finished jobs are kept for inspection but capped — without a limit they pile up in Redis
    // forever. Failed ones are kept longer because they are the ones someone needs to look at.
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
};

// Everything created here is tracked so closeQueues() can shut it down in the right order.
const queues: Queue[] = [];
const workers: Worker[] = [];

export function createQueue<T>(name: string) {
    const queue = new Queue<T>(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queue.on("error", (err) => logConnectionError(`queue:${name}`, err));
    queues.push(queue);
    return queue;
}

/**
 * Workers run inside the API process, started from index.ts. Moving them to a separate worker
 * process later only means a second entrypoint that calls the same start functions.
 */
export function createWorker<T>(
    name: string,
    processor: Processor<T>,
    opts: Omit<WorkerOptions, "connection"> = {},
) {
    const worker = new Worker<T>(name, processor, { ...opts, connection });
    // Without an `error` listener a connection failure is an unhandled 'error' event.
    worker.on("error", (err) => logConnectionError(`worker:${name}`, err));
    // Each attempt that throws lands here; the job itself is retried per its attempts/backoff.
    worker.on("failed", (job, err) => {
        logger.error(
            `worker:${name}`,
            `job ${job?.name}#${job?.id} failed (attempt ${job?.attemptsMade})`,
            err,
        );
    });
    workers.push(worker);
    return worker;
}

/**
 * Workers first: close() waits for the jobs they are running to finish, and those jobs may
 * still enqueue follow-ups. A job cut off by a hard kill is not lost — BullMQ marks it stalled
 * and runs it again — but a clean close avoids running it twice.
 */
export async function closeQueues() {
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(queues.map((queue) => queue.close()));
}

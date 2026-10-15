/**
 * Sample module — copy this folder to start a real one, then delete it.
 *
 * Shape: <name>.service.ts (the only DB layer) + <name>.controller.ts (req/res + zod) +
 * routes (path -> handler) + index.ts (this file, the module's public API). With background
 * work: <name>.queue.ts (the queue contract) + <name>.worker.ts (its consumer).
 */
export { exampleRouter } from "./example.routes.js";
export { startExampleWorker } from "./example.worker.js";
export { publicExampleRouter } from "./public.routes.js";

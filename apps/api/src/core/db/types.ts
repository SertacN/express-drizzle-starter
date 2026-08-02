import type { db } from "./client.js";

/**
 * Transaction handle. Lives in core because it shows up in cross-module signatures —
 * a service that must run inside someone else's transaction takes `tx: Tx`.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

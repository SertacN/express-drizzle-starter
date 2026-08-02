import type { RequestHandler } from "express";

export const check: RequestHandler = (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
};

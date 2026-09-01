import type { RequestHandler } from "express";
import { z } from "zod";
import { exampleCreateSchema, exampleListQuerySchema, exampleUpdateSchema } from "shared";
import * as exampleService from "./example.service.js";

// Route params are strings until proven otherwise — validate the id before it reaches a query.
const idParamSchema = z.object({ id: z.uuid() });

export const list: RequestHandler = async (req, res) => {
    const query = exampleListQuerySchema.parse(req.query);
    res.json(await exampleService.listExamples(req.auth!.userId, query));
};

export const get: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await exampleService.getExample(req.auth!.userId, id));
};

export const create: RequestHandler = async (req, res) => {
    const input = exampleCreateSchema.parse(req.body);
    res.status(201).json(await exampleService.createExample(req.auth!.userId, input));
};

export const update: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = exampleUpdateSchema.parse(req.body);
    res.json(await exampleService.updateExample(req.auth!.userId, id, input));
};

export const remove: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await exampleService.softDeleteExample(req.auth!.userId, id);
    res.status(204).end();
};

export const listPublished: RequestHandler = async (_req, res) => {
    res.json(await exampleService.listPublishedExamples());
};

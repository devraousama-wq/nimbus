import type { FastifyInstance } from "fastify";
import {
  SegmentStore,
  SegmentNotFoundError,
  SegmentConflictError,
  SegmentReferenceError,
  environmentParamSchema,
  segmentPreviewBodySchema,
} from "./store.js";

export function registerSegmentRoutes(app: FastifyInstance, store: SegmentStore) {
  app.get("/segments", async (req) => {
    const query = environmentParamSchema.parse(req.query);
    return { segments: store.list(query.environment) };
  });

  app.get("/segments/usage", async () => ({
    usage: store.usageReport(),
  }));

  app.get<{ Params: { key: string } }>("/segments/:key", async (req, reply) => {
    const segment = store.get(req.params.key);
    if (!segment) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { segment };
  });

  app.post("/segments", async (req, reply) => {
    try {
      const segment = store.create(req.body);
      return reply.status(201).send({ segment });
    } catch (err) {
      if (err instanceof SegmentConflictError) {
        return reply.status(409).send({ error: "conflict", message: err.message });
      }
      if (err instanceof SegmentReferenceError) {
        return reply.status(400).send({ error: "invalid_reference", message: err.message });
      }
      throw err;
    }
  });

  app.patch<{ Params: { key: string } }>("/segments/:key", async (req, reply) => {
    try {
      const segment = store.update(req.params.key, req.body);
      return { segment };
    } catch (err) {
      if (err instanceof SegmentNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      if (err instanceof SegmentReferenceError) {
        return reply.status(400).send({ error: "invalid_reference", message: err.message });
      }
      throw err;
    }
  });

  app.delete<{ Params: { key: string } }>("/segments/:key", async (req, reply) => {
    try {
      store.delete(req.params.key);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof SegmentNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.post<{ Params: { key: string } }>("/segments/:key/preview", async (req, reply) => {
    const segment = store.get(req.params.key);
    if (!segment) {
      return reply.status(404).send({ error: "not_found" });
    }
    const body = segmentPreviewBodySchema.parse(req.body);
    const preview = store.preview(req.params.key, body);
    return { preview };
  });

  app.post<{ Params: { key: string } }>("/segments/:key/match", async (req, reply) => {
    const segment = store.get(req.params.key);
    if (!segment) {
      return reply.status(404).send({ error: "not_found" });
    }
    const query = environmentParamSchema.parse(req.query);
    const context = req.body as Record<string, string | number | boolean | string[]>;
    const matched = store.matches(req.params.key, context, query.environment);
    return { key: req.params.key, matched };
  });
}

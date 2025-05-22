import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { proportionZTest } from "@nimbus/stats";
import { experimentStatusSchema } from "@nimbus/shared";
import {
  ExperimentStore,
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentStatusError,
} from "./store.js";

const statusQuerySchema = z.object({
  status: experimentStatusSchema.optional(),
});

const analyzeBodySchema = z.object({
  control: z.object({
    successes: z.number().nonnegative(),
    trials: z.number().nonnegative(),
  }),
  treatment: z.object({
    successes: z.number().nonnegative(),
    trials: z.number().nonnegative(),
  }),
  alpha: z.number().gt(0).lt(1).optional(),
  alternative: z.enum(["two-sided", "greater", "less"]).optional(),
});

export function registerExperimentRoutes(app: FastifyInstance, store: ExperimentStore) {
  app.get("/experiments", async (req) => {
    const query = statusQuerySchema.parse(req.query);
    return { experiments: store.list(query.status) };
  });

  app.get<{ Params: { key: string } }>("/experiments/:key", async (req, reply) => {
    const experiment = store.get(req.params.key);
    if (!experiment) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { experiment };
  });

  app.post("/experiments", async (req, reply) => {
    try {
      const experiment = store.create(req.body);
      return reply.status(201).send({ experiment });
    } catch (err) {
      if (err instanceof ExperimentConflictError) {
        return reply.status(409).send({ error: "conflict", message: err.message });
      }
      throw err;
    }
  });

  app.patch<{ Params: { key: string } }>("/experiments/:key", async (req, reply) => {
    try {
      const experiment = store.update(req.params.key, req.body);
      return { experiment };
    } catch (err) {
      if (err instanceof ExperimentNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      if (err instanceof ExperimentStatusError) {
        return reply.status(400).send({ error: "invalid_status", message: err.message });
      }
      throw err;
    }
  });

  app.delete<{ Params: { key: string } }>("/experiments/:key", async (req, reply) => {
    try {
      store.delete(req.params.key);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof ExperimentNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.post<{ Params: { key: string } }>(
    "/experiments/:key/analyze",
    async (req, reply) => {
      const experiment = store.get(req.params.key);
      if (!experiment) {
        return reply.status(404).send({ error: "not_found" });
      }
      const body = analyzeBodySchema.parse(req.body);
      const result = proportionZTest({
        control: body.control,
        treatment: body.treatment,
        alpha: body.alpha,
        alternative: body.alternative,
      });
      return {
        experimentKey: experiment.key,
        analysis: result,
      };
    },
  );
}

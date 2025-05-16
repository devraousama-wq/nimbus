import type { FastifyInstance } from "fastify";
import { environmentParamSchema } from "./store.js";
import { FlagStore, FlagConflictError, FlagNotFoundError } from "./store.js";

export function registerFlagRoutes(app: FastifyInstance, store: FlagStore) {
  app.get("/flags", async (req) => {
    const query = environmentParamSchema.parse(req.query);
    return { flags: store.list(query.environment) };
  });

  app.get<{ Params: { key: string } }>("/flags/:key", async (req, reply) => {
    const flag = store.get(req.params.key);
    if (!flag) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { flag };
  });

  app.post("/flags", async (req, reply) => {
    try {
      const flag = store.create(req.body);
      return reply.status(201).send({ flag });
    } catch (err) {
      if (err instanceof FlagConflictError) {
        return reply.status(409).send({ error: "conflict", message: err.message });
      }
      throw err;
    }
  });

  app.patch<{ Params: { key: string } }>("/flags/:key", async (req, reply) => {
    try {
      const flag = store.update(req.params.key, req.body);
      return { flag };
    } catch (err) {
      if (err instanceof FlagNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.delete<{ Params: { key: string } }>("/flags/:key", async (req, reply) => {
    try {
      store.delete(req.params.key);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof FlagNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });
}

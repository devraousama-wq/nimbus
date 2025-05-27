import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { WebhookDispatcher } from "./dispatcher.js";
import {
  WebhookStore,
  WebhookNotFoundError,
  webhookEventTypeSchema,
} from "./store.js";

const emitBodySchema = z.object({
  type: webhookEventTypeSchema,
  data: z.record(z.unknown()),
});

export function registerWebhookRoutes(
  app: FastifyInstance,
  store: WebhookStore,
  dispatcher: WebhookDispatcher,
) {
  app.get("/webhooks", async () => ({
    endpoints: store.listEndpoints(),
  }));

  app.get("/webhooks/deliveries", async (req) => {
    const query = z
      .object({
        endpointId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .parse(req.query);
    return {
      deliveries: store.listDeliveries(query.endpointId, query.limit ?? 50),
    };
  });

  app.get<{ Params: { id: string } }>("/webhooks/:id", async (req, reply) => {
    const endpoint = store.getEndpoint(req.params.id);
    if (!endpoint) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { endpoint };
  });

  app.post("/webhooks", async (req, reply) => {
    const endpoint = store.createEndpoint(req.body);
    return reply.status(201).send({ endpoint });
  });

  app.patch<{ Params: { id: string } }>("/webhooks/:id", async (req, reply) => {
    try {
      const endpoint = store.updateEndpoint(req.params.id, req.body);
      return { endpoint };
    } catch (err) {
      if (err instanceof WebhookNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/webhooks/:id", async (req, reply) => {
    try {
      store.deleteEndpoint(req.params.id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof WebhookNotFoundError) {
        return reply.status(404).send({ error: "not_found" });
      }
      throw err;
    }
  });

  app.post("/webhooks/emit", async (req) => {
    const body = emitBodySchema.parse(req.body);
    const results = await dispatcher.emit(body.type, body.data);
    return { results };
  });

  app.post<{ Params: { deliveryId: string } }>(
    "/webhooks/deliveries/:deliveryId/retry",
    async (req, reply) => {
      const delivery = store.getDelivery(req.params.deliveryId);
      if (!delivery) {
        return reply.status(404).send({ error: "not_found" });
      }
      const result = await dispatcher.redeliver(req.params.deliveryId);
      return { result };
    },
  );

  app.get<{ Params: { deliveryId: string } }>(
    "/webhooks/deliveries/:deliveryId",
    async (req, reply) => {
      const delivery = store.getDelivery(req.params.deliveryId);
      if (!delivery) {
        return reply.status(404).send({ error: "not_found" });
      }
      return { delivery };
    },
  );
}

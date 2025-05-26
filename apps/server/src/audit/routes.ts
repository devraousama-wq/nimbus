import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActionSchema, AuditLogStore } from "./log.js";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  action: auditActionSchema.optional(),
  resourceKey: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  since: z.string().datetime().optional(),
});

export function registerAuditRoutes(app: FastifyInstance, store: AuditLogStore) {
  app.get("/audit", async (req) => {
    const query = auditQuerySchema.parse(req.query);
    const result = store.list(query);
    return {
      entries: result.entries,
      total: result.total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  });
}

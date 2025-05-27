import { z } from "zod";

export const webhookEventTypeSchema = z.enum([
  "flag.created",
  "flag.updated",
  "flag.deleted",
  "segment.created",
  "segment.updated",
  "segment.deleted",
  "experiment.started",
  "experiment.concluded",
]);

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookEndpointSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  secret: z.string().min(16).max(256),
  events: z.array(webhookEventTypeSchema).min(1),
  enabled: z.boolean().default(true),
  description: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).max(256),
  events: z.array(webhookEventTypeSchema).min(1),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

export const updateWebhookSchema = createWebhookSchema.partial();

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "retrying";

export const webhookDeliverySchema = z.object({
  id: z.string().min(1),
  endpointId: z.string().min(1),
  eventType: webhookEventTypeSchema,
  payload: z.record(z.unknown()),
  status: z.enum(["pending", "delivered", "failed", "retrying"]),
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().positive(),
  responseStatus: z.number().int().optional(),
  responseBody: z.string().max(4000).optional(),
  errorMessage: z.string().max(2000).optional(),
  nextRetryAt: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class WebhookStore {
  private endpoints = new Map<string, WebhookEndpoint>();
  private deliveries = new Map<string, WebhookDelivery>();

  listEndpoints(): WebhookEndpoint[] {
    return [...this.endpoints.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getEndpoint(id: string): WebhookEndpoint | undefined {
    return this.endpoints.get(id);
  }

  createEndpoint(input: unknown): WebhookEndpoint {
    const parsed = createWebhookSchema.parse(input);
    const ts = nowIso();
    const endpoint: WebhookEndpoint = webhookEndpointSchema.parse({
      id: createId("wh"),
      ...parsed,
      enabled: parsed.enabled ?? true,
      createdAt: ts,
      updatedAt: ts,
    });
    this.endpoints.set(endpoint.id, endpoint);
    return endpoint;
  }

  updateEndpoint(id: string, input: unknown): WebhookEndpoint {
    const existing = this.endpoints.get(id);
    if (!existing) {
      throw new WebhookNotFoundError(id);
    }
    const patch = updateWebhookSchema.parse(input);
    const next: WebhookEndpoint = webhookEndpointSchema.parse({
      ...existing,
      ...patch,
      id,
      updatedAt: nowIso(),
    });
    this.endpoints.set(id, next);
    return next;
  }

  deleteEndpoint(id: string): void {
    if (!this.endpoints.delete(id)) {
      throw new WebhookNotFoundError(id);
    }
  }

  listDeliveries(endpointId?: string, limit = 50): WebhookDelivery[] {
    let all = [...this.deliveries.values()];
    if (endpointId) {
      all = all.filter((d) => d.endpointId === endpointId);
    }
    return all
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getDelivery(id: string): WebhookDelivery | undefined {
    return this.deliveries.get(id);
  }

  createDelivery(
    endpointId: string,
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
    maxAttempts = 5,
  ): WebhookDelivery {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      throw new WebhookNotFoundError(endpointId);
    }
    const delivery: WebhookDelivery = webhookDeliverySchema.parse({
      id: createId("dlv"),
      endpointId,
      eventType,
      payload,
      status: "pending",
      attempt: 0,
      maxAttempts,
      createdAt: nowIso(),
    });
    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }

  updateDelivery(id: string, patch: Partial<WebhookDelivery>): WebhookDelivery {
    const existing = this.deliveries.get(id);
    if (!existing) {
      throw new WebhookDeliveryNotFoundError(id);
    }
    const next = webhookDeliverySchema.parse({ ...existing, ...patch, id });
    this.deliveries.set(id, next);
    return next;
  }

  findDueRetries(now = Date.now()): WebhookDelivery[] {
    return [...this.deliveries.values()].filter((d) => {
      if (d.status !== "retrying" || !d.nextRetryAt) {
        return false;
      }
      return Date.parse(d.nextRetryAt) <= now;
    });
  }

  endpointsForEvent(eventType: WebhookEventType): WebhookEndpoint[] {
    return [...this.endpoints.values()].filter(
      (e) => e.enabled && e.events.includes(eventType),
    );
  }
}

export class WebhookNotFoundError extends Error {
  constructor(id: string) {
    super(`webhook endpoint not found: ${id}`);
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookDeliveryNotFoundError extends Error {
  constructor(id: string) {
    super(`webhook delivery not found: ${id}`);
    this.name = "WebhookDeliveryNotFoundError";
  }
}

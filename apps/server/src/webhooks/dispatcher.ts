import crypto from "node:crypto";
import type { WebhookDelivery, WebhookEndpoint, WebhookEventType } from "./store.js";
import { WebhookStore } from "./store.js";

export type WebhookPayload = {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
};

export type DispatchResult = {
  deliveryId: string;
  endpointId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
};

export type DispatcherOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  fetchFn?: typeof fetch;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export function signWebhookPayload(secret: string, body: string, timestamp: string): string {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  timestamp: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(secret, body, timestamp);
  const provided = signature.startsWith("sha256=") ? signature : `sha256=${signature}`;
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function computeBackoffDelay(
  attempt: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * baseDelayMs * 0.25);
  return Math.min(exponential + jitter, maxDelayMs);
}

export class WebhookDispatcher {
  private readonly store: WebhookStore;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly fetchFn: typeof fetch;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: WebhookStore, options: DispatcherOptions = {}) {
    this.store = store;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  startRetryProcessor(intervalMs = 5000): void {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = setInterval(() => {
      void this.processDueRetries();
    }, intervalMs);
  }

  stopRetryProcessor(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async emit(
    eventType: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<DispatchResult[]> {
    const endpoints = this.store.endpointsForEvent(eventType);
    const results: DispatchResult[] = [];
    for (const endpoint of endpoints) {
      const payload = this.buildPayload(eventType, data);
      const delivery = this.store.createDelivery(
        endpoint.id,
        eventType,
        payload as unknown as Record<string, unknown>,
        this.maxAttempts,
      );
      const result = await this.deliver(endpoint, delivery, payload);
      results.push(result);
    }
    return results;
  }

  async redeliver(deliveryId: string): Promise<DispatchResult> {
    const delivery = this.store.getDelivery(deliveryId);
    if (!delivery) {
      throw new Error(`delivery not found: ${deliveryId}`);
    }
    const endpoint = this.store.getEndpoint(delivery.endpointId);
    if (!endpoint) {
      throw new Error(`endpoint not found: ${delivery.endpointId}`);
    }
    const payload = delivery.payload as unknown as WebhookPayload;
    return this.deliver(endpoint, delivery, payload);
  }

  async processDueRetries(): Promise<DispatchResult[]> {
    const due = this.store.findDueRetries();
    const results: DispatchResult[] = [];
    for (const delivery of due) {
      const endpoint = this.store.getEndpoint(delivery.endpointId);
      if (!endpoint) {
        continue;
      }
      const payload = delivery.payload as unknown as WebhookPayload;
      const result = await this.deliver(endpoint, delivery, payload);
      results.push(result);
    }
    return results;
  }

  private buildPayload(
    eventType: WebhookEventType,
    data: Record<string, unknown>,
  ): WebhookPayload {
    return {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  private async deliver(
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
    payload: WebhookPayload,
  ): Promise<DispatchResult> {
    const attempt = delivery.attempt + 1;
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhookPayload(endpoint.secret, body, timestamp);

    this.store.updateDelivery(delivery.id, {
      status: "retrying",
      attempt,
    });

    try {
      const response = await this.fetchFn(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nimbus-Event": payload.type,
          "X-Nimbus-Delivery": delivery.id,
          "X-Nimbus-Timestamp": timestamp,
          "X-Nimbus-Signature": signature,
        },
        body,
      });

      const responseBody = await response.text().catch(() => "");
      const truncated = responseBody.slice(0, 4000);

      if (response.ok) {
        this.store.updateDelivery(delivery.id, {
          status: "delivered",
          responseStatus: response.status,
          responseBody: truncated,
          completedAt: new Date().toISOString(),
          errorMessage: undefined,
          nextRetryAt: undefined,
        });
        return {
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          success: true,
          statusCode: response.status,
        };
      }

      return this.handleFailure(
        endpoint,
        delivery,
        attempt,
        `HTTP ${response.status}`,
        response.status,
        truncated,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "delivery failed";
      return this.handleFailure(endpoint, delivery, attempt, message);
    }
  }

  private handleFailure(
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
    attempt: number,
    errorMessage: string,
    responseStatus?: number,
    responseBody?: string,
  ): DispatchResult {
    if (attempt >= delivery.maxAttempts) {
      this.store.updateDelivery(delivery.id, {
        status: "failed",
        responseStatus,
        responseBody,
        errorMessage,
        completedAt: new Date().toISOString(),
        nextRetryAt: undefined,
      });
      return {
        deliveryId: delivery.id,
        endpointId: endpoint.id,
        success: false,
        statusCode: responseStatus,
        error: errorMessage,
      };
    }

    const delayMs = computeBackoffDelay(attempt, this.baseDelayMs, this.maxDelayMs);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

    this.store.updateDelivery(delivery.id, {
      status: "retrying",
      attempt,
      responseStatus,
      responseBody,
      errorMessage,
      nextRetryAt,
    });

    return {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      success: false,
      statusCode: responseStatus,
      error: errorMessage,
    };
  }
}

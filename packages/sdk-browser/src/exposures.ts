import type { Environment } from "@nimbus/shared";

export type ExposureEvent = {
  flagKey: string;
  variantKey: string | null;
  value: boolean | string | number | Record<string, unknown> | null;
  environment: Environment;
  userId: string | null;
  occurredAt: number;
};

export type ExposureTrackerOptions = {
  endpoint: string;
  batchSize?: number;
  flushIntervalMs?: number;
  fetchFn?: typeof fetch;
  sendBeaconFn?: typeof navigator.sendBeacon;
};

export class ExposureTracker {
  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sendBeaconFn: ((url: string, data?: BodyInit | null) => boolean) | undefined;
  private queue: ExposureEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private environment: Environment = "development";
  private userId: string | null = null;

  constructor(options: ExposureTrackerOptions) {
    this.endpoint = options.endpoint;
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 10_000;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.sendBeaconFn = options.sendBeaconFn;
  }

  configure(environment: Environment, userId: string | null): void {
    this.environment = environment;
    this.userId = userId;
  }

  track(event: Omit<ExposureEvent, "environment" | "userId" | "occurredAt">): void {
    this.queue.push({
      ...event,
      environment: this.environment,
      userId: this.userId,
      occurredAt: Date.now(),
    });
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    const batch = this.queue.splice(0, this.batchSize);
    const body = JSON.stringify({ exposures: batch });
    if (this.sendBeaconFn && typeof this.sendBeaconFn === "function") {
      const sent = this.sendBeaconFn.call(navigator, this.endpoint, body);
      if (sent) {
        return;
      }
    }
    await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  }

  pendingCount(): number {
    return this.queue.length;
  }
}

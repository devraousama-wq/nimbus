import { EventEmitter } from "node:events";
import type { Environment } from "@nimbus/shared";
import {
  type RealtimeEvent,
  redisChannelForEnvironment,
} from "./bus.js";

export type PubSub = {
  readonly mode: "redis" | "memory";
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(environment: Environment, event: RealtimeEvent): Promise<void>;
  subscribe(handler: (event: RealtimeEvent) => void): () => void;
};

type PubSubOptions = {
  redisUrl?: string;
};

type RedisConstructor = new (url: string, options?: { lazyConnect?: boolean }) => {
  connect(): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<number>;
  on(event: "message", handler: (channel: string, message: string) => void): void;
  on(event: "error", handler: (err: Error) => void): void;
  quit(): Promise<string>;
};

class MemoryPubSub implements PubSub {
  readonly mode = "memory" as const;
  private readonly bus = new EventEmitter();
  private started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    this.bus.removeAllListeners();
  }

  async publish(environment: Environment, event: RealtimeEvent): Promise<void> {
    if (!this.started) {
      return;
    }
    const channel = redisChannelForEnvironment(environment);
    this.bus.emit(channel, event);
    this.bus.emit("message", event);
  }

  subscribe(handler: (event: RealtimeEvent) => void): () => void {
    const listener = (event: RealtimeEvent) => handler(event);
    this.bus.on("message", listener);
    return () => {
      this.bus.off("message", listener);
    };
  }
}

class RedisPubSub implements PubSub {
  readonly mode = "redis" as const;
  private publisher: InstanceType<RedisConstructor> | null = null;
  private subscriber: InstanceType<RedisConstructor> | null = null;
  private readonly handlers = new Set<(event: RealtimeEvent) => void>();
  private readonly redisUrl: string;
  private readonly subscribed = new Set<string>();

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  async start(): Promise<void> {
    const Redis = await loadRedisConstructor();
    if (!Redis) {
      throw new Error("ioredis is not installed");
    }
    this.publisher = new Redis(this.redisUrl, { lazyConnect: true });
    this.subscriber = new Redis(this.redisUrl, { lazyConnect: true });
    await this.publisher.connect();
    await this.subscriber.connect();
    this.subscriber.on("message", (channel, message) => {
      this.dispatchMessage(channel, message);
    });
    this.subscriber.on("error", () => undefined);
    this.publisher.on("error", () => undefined);
    const channels = [
      redisChannelForEnvironment("development"),
      redisChannelForEnvironment("staging"),
      redisChannelForEnvironment("production"),
    ];
    for (const channel of channels) {
      await this.subscriber.subscribe(channel);
      this.subscribed.add(channel);
    }
  }

  async stop(): Promise<void> {
    const tasks: Promise<string>[] = [];
    if (this.publisher) {
      tasks.push(this.publisher.quit());
      this.publisher = null;
    }
    if (this.subscriber) {
      tasks.push(this.subscriber.quit());
      this.subscriber = null;
    }
    await Promise.all(tasks);
    this.subscribed.clear();
    this.handlers.clear();
  }

  async publish(environment: Environment, event: RealtimeEvent): Promise<void> {
    if (!this.publisher) {
      return;
    }
    const channel = redisChannelForEnvironment(environment);
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  subscribe(handler: (event: RealtimeEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private dispatchMessage(channel: string, raw: string): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }
    if (redisChannelForEnvironment(event.environment) !== channel) {
      return;
    }
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

async function loadRedisConstructor(): Promise<RedisConstructor | null> {
  try {
    const mod = await import("ioredis");
    return mod.default as unknown as RedisConstructor;
  } catch {
    return null;
  }
}

export async function createPubSub(options: PubSubOptions): Promise<PubSub> {
  if (options.redisUrl) {
    const Redis = await loadRedisConstructor();
    if (Redis) {
      return new RedisPubSub(options.redisUrl);
    }
  }
  return new MemoryPubSub();
}

export function wirePubSubToBus(
  pubsub: PubSub,
  publish: (event: RealtimeEvent) => void,
): () => void {
  return pubsub.subscribe((event) => publish(event));
}

import { EventEmitter } from "node:events";
import type { Environment, FlagDefinition } from "@nimbus/shared";
import { createRequestId } from "@nimbus/shared";

export type RealtimeEventType =
  | "connected"
  | "flag.created"
  | "flag.updated"
  | "flag.deleted"
  | "ping";

export type RealtimeEventPayload = {
  flag?: FlagDefinition;
  key?: string;
  message?: string;
};

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  environment: Environment;
  timestamp: number;
  payload?: RealtimeEventPayload;
};

export type FlagChangeAction = "created" | "updated" | "deleted";

export function createRealtimeEvent(
  type: RealtimeEventType,
  environment: Environment,
  payload?: RealtimeEventPayload,
): RealtimeEvent {
  return {
    id: createRequestId(),
    type,
    environment,
    timestamp: Date.now(),
    payload,
  };
}

export function flagChangeEvent(
  action: FlagChangeAction,
  environment: Environment,
  flag?: FlagDefinition,
  key?: string,
): RealtimeEvent {
  const typeMap: Record<FlagChangeAction, RealtimeEventType> = {
    created: "flag.created",
    updated: "flag.updated",
    deleted: "flag.deleted",
  };
  return createRealtimeEvent(typeMap[action], environment, { flag, key });
}

export class RealtimeBus extends EventEmitter {
  private readonly maxListeners = 512;

  constructor() {
    super();
    this.setMaxListeners(this.maxListeners);
  }

  publish(event: RealtimeEvent): void {
    this.emit("event", event);
    this.emit(channelForEnvironment(event.environment), event);
  }

  subscribeEnvironment(
    environment: Environment,
    handler: (event: RealtimeEvent) => void,
  ): () => void {
    const channel = channelForEnvironment(environment);
    this.on(channel, handler);
    return () => {
      this.off(channel, handler);
    };
  }

  subscribeAll(handler: (event: RealtimeEvent) => void): () => void {
    this.on("event", handler);
    return () => {
      this.off("event", handler);
    };
  }

  listenerCountForEnvironment(environment: Environment): number {
    return this.listenerCount(channelForEnvironment(environment));
  }
}

export function channelForEnvironment(environment: Environment): string {
  return `env:${environment}`;
}

export function redisChannelForEnvironment(environment: Environment): string {
  return `nimbus:realtime:${environment}`;
}

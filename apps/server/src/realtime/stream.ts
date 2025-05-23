import type { FastifyInstance } from "fastify";
import { isEnvironment, type Environment } from "@nimbus/shared";
import {
  type RealtimeBus,
  type RealtimeEvent,
  createRealtimeEvent,
} from "./bus.js";
import { type PubSub, wirePubSubToBus } from "./pubsub.js";

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;

export type StreamRuntime = {
  bus: RealtimeBus;
  pubsub: PubSub;
  unsubscribePubSub: () => void;
};

export function createStreamRuntime(bus: RealtimeBus, pubsub: PubSub): StreamRuntime {
  const unsubscribePubSub = wirePubSubToBus(pubsub, (event) => bus.publish(event));
  return { bus, pubsub, unsubscribePubSub };
}

export function registerStreamRoutes(app: FastifyInstance, runtime: StreamRuntime) {
  app.get<{ Params: { environment: string } }>(
    "/stream/:environment",
    async (req, reply) => {
      const environment = req.params.environment;
      if (!isEnvironment(environment)) {
        return reply.status(400).send({ error: "invalid_environment" });
      }

      reply.hijack();
      writeSseHeaders(reply);

      const connected = createRealtimeEvent("connected", environment, {
        message: "stream_open",
      });
      writeSseEvent(reply, connected);

      const unsubscribe = runtime.bus.subscribeEnvironment(environment, (event) => {
        writeSseEvent(reply, event);
      });

      const heartbeat = setInterval(() => {
        const ping = createRealtimeEvent("ping", environment);
        writeSseEvent(reply, ping);
      }, HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      req.raw.on("close", cleanup);
      req.raw.on("error", cleanup);
    },
  );
}

function writeSseHeaders(
  reply: { raw: NodeJS.WritableStream & { write: (chunk: string) => boolean } },
) {
  const headers = [
    "HTTP/1.1 200 OK",
    "Content-Type: text/event-stream",
    "Cache-Control: no-cache, no-transform",
    "Connection: keep-alive",
    "X-Accel-Buffering: no",
    `Retry: ${RETRY_MS}`,
    "",
    "",
  ].join("\r\n");
  reply.raw.write(headers);
}

function writeSseEvent(
  reply: { raw: NodeJS.WritableStream & { write: (chunk: string) => boolean } },
  event: RealtimeEvent,
) {
  const data = JSON.stringify({
    id: event.id,
    type: event.type,
    environment: event.environment,
    timestamp: event.timestamp,
    payload: event.payload,
  });
  const frame = `id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`;
  reply.raw.write(frame);
}

export async function broadcastFlagChange(
  runtime: StreamRuntime,
  environment: Environment,
  event: RealtimeEvent,
): Promise<void> {
  await runtime.pubsub.publish(environment, event);
}

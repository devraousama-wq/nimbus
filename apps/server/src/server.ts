import Fastify from "fastify";
import { createRequestId, type FlagDefinition } from "@nimbus/shared";
import type { AppConfig } from "./config.js";
import { AuditLogStore, createAuditEntryFromMutation } from "./audit/log.js";
import { registerAuditRoutes } from "./audit/routes.js";
import { FlagStore } from "./flags/store.js";
import { registerFlagRoutes } from "./flags/routes.js";
import { SegmentStore } from "./segments/store.js";
import { registerSegmentRoutes } from "./segments/routes.js";
import { WebhookStore } from "./webhooks/store.js";
import { WebhookDispatcher } from "./webhooks/dispatcher.js";
import { registerWebhookRoutes } from "./webhooks/routes.js";
import { ExperimentStore } from "./experiments/store.js";
import { registerExperimentRoutes } from "./experiments/routes.js";
import { RealtimeBus, flagChangeEvent } from "./realtime/bus.js";
import { createPubSub } from "./realtime/pubsub.js";
import {
  createStreamRuntime,
  registerStreamRoutes,
  broadcastFlagChange,
  type StreamRuntime,
} from "./realtime/stream.js";

export async function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
    genReqId: () => createRequestId(),
  });

  const flagStore = new FlagStore();
  const auditLog = new AuditLogStore();

  flagStore.onMutation((event) => {
    const action =
      event.action === "create"
        ? "flag.create"
        : event.action === "update"
          ? "flag.update"
          : "flag.delete";
    auditLog.append(
      createAuditEntryFromMutation(
        action,
        event.actor,
        event.requestId,
        event.before,
        event.after,
      ),
    );
  });

  const segmentStore = new SegmentStore();
  const webhookStore = new WebhookStore();
  const webhookDispatcher = new WebhookDispatcher(webhookStore);
  const bus = new RealtimeBus();
  const pubsub = await createPubSub({ redisUrl: config.REDIS_URL });
  await pubsub.start();
  const stream = createStreamRuntime(bus, pubsub);

  const notifyFlagChange = (
    action: "created" | "updated" | "deleted",
    flag: FlagDefinition | undefined,
    key: string,
  ) => {
    const environments = flag?.environments ?? [];
    for (const environment of environments) {
      const event = flagChangeEvent(action, environment, flag, key);
      void broadcastFlagChange(stream, environment, event);
    }
  };

  registerFlagRoutes(app, flagStore, notifyFlagChange);
  registerAuditRoutes(app, auditLog);
  registerSegmentRoutes(app, segmentStore);
  registerWebhookRoutes(app, webhookStore, webhookDispatcher);

  const experimentStore = new ExperimentStore();
  registerExperimentRoutes(app, experimentStore);

  registerStreamRoutes(app, stream);

  if (config.NODE_ENV !== "test") {
    webhookDispatcher.startRetryProcessor();
  }

  app.addHook("onClose", async () => {
    stream.unsubscribePubSub();
    await pubsub.stop();
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "nimbus",
    version: "0.1.0",
    realtime: pubsub.mode,
  }));

  app.get("/", async () => ({
    name: "nimbus",
    docs: "/health",
    stream: "/stream/:environment",
  }));

  return app;
}

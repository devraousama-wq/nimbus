import Fastify from "fastify";
import { createRequestId } from "@nimbus/shared";
import type { AppConfig } from "./config.js";
import { FlagStore } from "./flags/store.js";
import { registerFlagRoutes } from "./flags/routes.js";

export function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
    genReqId: () => createRequestId(),
  });

  const flagStore = new FlagStore();
  registerFlagRoutes(app, flagStore);

  app.get("/health", async () => ({
    status: "ok",
    service: "nimbus",
    version: "0.1.0",
  }));

  app.get("/", async () => ({
    name: "nimbus",
    docs: "/health",
  }));

  return app;
}

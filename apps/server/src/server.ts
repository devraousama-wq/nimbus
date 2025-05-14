import Fastify from "fastify";
import { createRequestId } from "@nimbus/shared";
import type { AppConfig } from "./config.js";

export function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
    genReqId: () => createRequestId(),
  });

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

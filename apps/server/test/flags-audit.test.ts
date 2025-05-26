import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { AuditLogStore, createAuditEntryFromMutation } from "../src/audit/log.js";
import { registerAuditRoutes } from "../src/audit/routes.js";
import { FlagStore } from "../src/flags/store.js";
import { registerFlagRoutes } from "../src/flags/routes.js";

function buildAuditTestServer() {
  const app = Fastify({ logger: false, genReqId: () => "req_test" });
  const flagStore = new FlagStore();
  const auditLog = new AuditLogStore();
  auditLog.clearForTests();

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

  registerFlagRoutes(app, flagStore);
  registerAuditRoutes(app, auditLog);
  return app;
}

describe("flag mutations audit", () => {
  let app: ReturnType<typeof buildAuditTestServer>;

  beforeEach(async () => {
    app = buildAuditTestServer();
    await app.ready();
  });

  it("records create update delete in audit log", async () => {
    const actor = { "x-nimbus-actor": "devraousama-wq" };
    const createRes = await app.inject({
      method: "POST",
      url: "/flags",
      headers: actor,
      payload: {
        key: "feature_x",
        name: "Feature X",
        type: "boolean",
        defaultValue: true,
        environments: ["development"],
      },
    });
    expect(createRes.statusCode).toBe(201);

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/flags/feature_x",
      headers: actor,
      payload: { enabled: false },
    });
    expect(patchRes.statusCode).toBe(200);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/flags/feature_x",
      headers: actor,
    });
    expect(deleteRes.statusCode).toBe(204);

    const auditRes = await app.inject({ method: "GET", url: "/audit" });
    expect(auditRes.statusCode).toBe(200);
    const body = auditRes.json() as { entries: Array<{ action: string; actor: string }> };
    expect(body.entries).toHaveLength(3);
    expect(body.entries.every((e) => e.actor === "devraousama-wq")).toBe(true);
    expect(body.entries.map((e) => e.action)).toEqual([
      "flag.delete",
      "flag.update",
      "flag.create",
    ]);
  });
});

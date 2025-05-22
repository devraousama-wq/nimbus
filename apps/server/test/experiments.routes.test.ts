import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 0,
};

const experimentPayload = {
  key: "homepage_hero",
  name: "Homepage hero test",
  flagKey: "homepage_hero_flag",
  variants: [
    { key: "control", name: "Original", weight: 50, isControl: true },
    { key: "variant_b", name: "Variant B", weight: 50, isControl: false },
  ],
};

describe("experiment routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer(config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates and lists experiments", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: experimentPayload,
    });
    expect(create.statusCode).toBe(201);
    const body = create.json() as { experiment: { key: string } };
    expect(body.experiment.key).toBe("homepage_hero");

    const list = await app.inject({ method: "GET", url: "/experiments" });
    expect(list.statusCode).toBe(200);
    const listed = list.json() as { experiments: { key: string }[] };
    expect(listed.experiments.some((e) => e.key === "homepage_hero")).toBe(true);
  });

  it("returns 409 on duplicate create", async () => {
    const dup = await app.inject({
      method: "POST",
      url: "/experiments",
      payload: experimentPayload,
    });
    expect(dup.statusCode).toBe(409);
  });

  it("gets, updates, and analyzes experiment", async () => {
    const get = await app.inject({
      method: "GET",
      url: "/experiments/homepage_hero",
    });
    expect(get.statusCode).toBe(200);

    const patch = await app.inject({
      method: "PATCH",
      url: "/experiments/homepage_hero",
      payload: { status: "running" },
    });
    expect(patch.statusCode).toBe(200);
    const patched = patch.json() as { experiment: { status: string } };
    expect(patched.experiment.status).toBe("running");

    const analyze = await app.inject({
      method: "POST",
      url: "/experiments/homepage_hero/analyze",
      payload: {
        control: { successes: 100, trials: 5000 },
        treatment: { successes: 130, trials: 5000 },
        alpha: 0.05,
      },
    });
    expect(analyze.statusCode).toBe(200);
    const analysis = analyze.json() as { analysis: { significant: boolean } };
    expect(analysis.analysis.significant).toBe(true);
  });

  it("returns 404 for missing experiment", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/experiments/does_not_exist",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("deletes experiment", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: "/experiments/homepage_hero",
    });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({
      method: "GET",
      url: "/experiments/homepage_hero",
    });
    expect(get.statusCode).toBe(404);
  });
});

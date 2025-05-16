import { describe, it, expect } from "vitest";
import { flagDefinitionSchema, createFlagSchema } from "../src/flags.js";

describe("flag schemas", () => {
  it("accepts boolean flag", () => {
    const input = {
      key: "dark_mode",
      name: "Dark mode",
      type: "boolean" as const,
      defaultValue: false,
      environments: ["development" as const],
    };
    expect(createFlagSchema.parse(input).key).toBe("dark_mode");
    const full = flagDefinitionSchema.parse({ ...input, version: 1, enabled: true });
    expect(full.type).toBe("boolean");
  });

  it("rejects invalid keys", () => {
    expect(() =>
      createFlagSchema.parse({
        key: "Bad Key",
        name: "x",
        type: "boolean",
        defaultValue: true,
        environments: ["production"],
      }),
    ).toThrow();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NimbusProvider, useFlag } from "../src/react.js";

function FlagConsumer({ flagKey }: { flagKey: string }) {
  const { value, enabled, loading } = useFlag<boolean>(flagKey, false);
  if (loading) {
    return <span data-testid="state">loading</span>;
  }
  return (
    <span data-testid="state">
      {enabled ? "on" : "off"}:{String(value)}
    </span>
  );
}

describe("useFlag", () => {
  it("renders flag state after bootstrap", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "e1" },
      json: async () => ({
        flags: [
          {
            key: "banner",
            name: "Banner",
            type: "boolean",
            defaultValue: true,
            environments: ["development"],
            version: 1,
            enabled: true,
            prerequisiteKeys: [],
          },
        ],
      }),
    });
    render(
      <NimbusProvider
        baseUrl="https://nimbus.test"
        environment="development"
        clientOptions={{ fetchFn, trackExposures: false }}
      >
        <FlagConsumer flagKey="banner" />
      </NimbusProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("on:true");
    });
  });
});

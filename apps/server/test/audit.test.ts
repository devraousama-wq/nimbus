import { describe, it, expect, beforeEach } from "vitest";
import { AuditLogStore, createAuditEntryFromMutation } from "../src/audit/log.js";

const flag = {
  key: "dark_mode",
  name: "Dark mode",
  type: "boolean" as const,
  defaultValue: false,
  environments: ["development" as const],
  version: 1,
  enabled: true,
  prerequisiteKeys: [] as string[],
};

describe("AuditLogStore", () => {
  let store: AuditLogStore;

  beforeEach(() => {
    store = new AuditLogStore();
    store.clearForTests();
  });

  it("appends entries in order", () => {
    store.append(
      createAuditEntryFromMutation("flag.create", "alice", "req_1", null, flag),
    );
    store.append(
      createAuditEntryFromMutation("flag.update", "alice", "req_2", flag, {
        ...flag,
        version: 2,
        enabled: false,
      }),
    );
    expect(store.count()).toBe(2);
    const list = store.list();
    expect(list.entries[0]?.action).toBe("flag.update");
    expect(list.entries[1]?.action).toBe("flag.create");
  });

  it("filters by resource key and action", () => {
    store.append(
      createAuditEntryFromMutation("flag.create", "bob", "req_a", null, flag),
    );
    store.append(
      createAuditEntryFromMutation(
        "flag.delete",
        "bob",
        "req_b",
        flag,
        null,
      ),
    );
    const filtered = store.list({ action: "flag.delete", resourceKey: "dark_mode" });
    expect(filtered.total).toBe(1);
    expect(filtered.entries[0]?.action).toBe("flag.delete");
  });
});

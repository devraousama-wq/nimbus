import { z } from "zod";
import type { FlagDefinition } from "@nimbus/shared";
import { createRequestId } from "@nimbus/shared";

export const auditActionSchema = z.enum(["flag.create", "flag.update", "flag.delete"]);

export type AuditAction = z.infer<typeof auditActionSchema>;

export type AuditEntry = {
  id: string;
  occurredAt: string;
  actor: string;
  action: AuditAction;
  resourceKey: string;
  requestId: string;
  before: FlagDefinition | null;
  after: FlagDefinition | null;
};

export type AppendAuditInput = {
  actor: string;
  action: AuditAction;
  resourceKey: string;
  requestId?: string;
  before: FlagDefinition | null;
  after: FlagDefinition | null;
};

export type AuditQuery = {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  resourceKey?: string;
  actor?: string;
  since?: string;
};

const entries: AuditEntry[] = [];

export class AuditLogStore {
  append(input: AppendAuditInput): AuditEntry {
    const entry: AuditEntry = {
      id: `aud_${createRequestId().slice(4)}`,
      occurredAt: new Date().toISOString(),
      actor: input.actor,
      action: input.action,
      resourceKey: input.resourceKey,
      requestId: input.requestId ?? createRequestId(),
      before: input.before,
      after: input.after,
    };
    entries.push(entry);
    return entry;
  }

  list(query: AuditQuery = {}): { entries: AuditEntry[]; total: number } {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    let filtered = [...entries];
    if (query.action) {
      filtered = filtered.filter((e) => e.action === query.action);
    }
    if (query.resourceKey) {
      filtered = filtered.filter((e) => e.resourceKey === query.resourceKey);
    }
    if (query.actor) {
      filtered = filtered.filter((e) => e.actor === query.actor);
    }
    if (query.since) {
      const sinceMs = Date.parse(query.since);
      if (!Number.isNaN(sinceMs)) {
        filtered = filtered.filter((e) => Date.parse(e.occurredAt) >= sinceMs);
      }
    }
    const total = filtered.length;
    const slice = filtered.slice(Math.max(0, filtered.length - offset - limit), filtered.length - offset);
    return { entries: slice.reverse(), total };
  }

  count(): number {
    return entries.length;
  }

  clearForTests(): void {
    entries.length = 0;
  }
}

export function createAuditEntryFromMutation(
  action: AuditAction,
  actor: string,
  requestId: string,
  before: FlagDefinition | null,
  after: FlagDefinition | null,
): AppendAuditInput {
  const resourceKey = after?.key ?? before?.key ?? "unknown";
  return { actor, action, resourceKey, requestId, before, after };
}

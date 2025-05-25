import type { Environment, FlagDefinition } from "@nimbus/shared";

export type BootstrapPayload = {
  flags: FlagDefinition[];
  etag: string;
  fetchedAt: number;
  environment: Environment;
};

export type CacheOptions = {
  storageKey?: string;
  ttlMs?: number;
  storage?: Storage | null;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_KEY = "nimbus.bootstrap";

export class FlagCache {
  private readonly storageKey: string;
  private readonly ttlMs: number;
  private readonly storage: Storage | null;

  constructor(options: CacheOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_KEY;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.storage = options.storage ?? resolveStorage();
  }

  read(): BootstrapPayload | null {
    if (!this.storage) {
      return null;
    }
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as BootstrapPayload;
      if (!parsed.fetchedAt || !parsed.etag || !Array.isArray(parsed.flags)) {
        return null;
      }
      if (Date.now() - parsed.fetchedAt > this.ttlMs) {
        this.clear();
        return null;
      }
      return parsed;
    } catch {
      this.clear();
      return null;
    }
  }

  write(payload: Omit<BootstrapPayload, "fetchedAt"> & { fetchedAt?: number }): BootstrapPayload {
    const entry: BootstrapPayload = {
      ...payload,
      fetchedAt: payload.fetchedAt ?? Date.now(),
    };
    if (this.storage) {
      this.storage.setItem(this.storageKey, JSON.stringify(entry));
    }
    return entry;
  }

  clear(): void {
    this.storage?.removeItem(this.storageKey);
  }

  isFresh(etag: string | null): boolean {
    const cached = this.read();
    if (!cached) {
      return false;
    }
    if (!etag) {
      return true;
    }
    return cached.etag === etag;
  }
}

function resolveStorage(): Storage | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

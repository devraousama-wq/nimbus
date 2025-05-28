import type { Environment } from "@nimbus/shared";

export type FlagSummary = {
  key: string;
  name: string;
  type: string;
  enabled: boolean;
  environments: Environment[];
  version: number;
};

export type FlagsResponse = {
  flags: FlagSummary[];
};

export type ApiError = {
  error: string;
  message?: string;
};

const API_BASE = "/api";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let body: ApiError = { error: "request_failed" };
    try {
      body = (await response.json()) as ApiError;
    } catch {
      body = { error: "request_failed" };
    }
    throw new ApiRequestError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message ?? body.error);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export function listFlags(environment: Environment): Promise<FlagsResponse> {
  const params = new URLSearchParams({ environment });
  return request<FlagsResponse>(`/flags?${params.toString()}`);
}

export function getFlag(key: string): Promise<{ flag: FlagSummary }> {
  return request<{ flag: FlagSummary }>(`/flags/${encodeURIComponent(key)}`);
}

export function deleteFlag(key: string): Promise<void> {
  return request<void>(`/flags/${encodeURIComponent(key)}`, { method: "DELETE" });
}

export function healthCheck(): Promise<{ status: string; service: string }> {
  return request<{ status: string; service: string }>("/health");
}

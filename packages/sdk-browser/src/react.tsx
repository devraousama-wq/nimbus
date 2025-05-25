import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Environment, UserContext } from "@nimbus/shared";
import { NimbusClient, type FlagValue, type NimbusClientOptions } from "./client.js";

export type NimbusProviderProps = {
  children: ReactNode;
  baseUrl: string;
  environment: Environment;
  userId?: string;
  context?: UserContext;
  clientOptions?: Omit<NimbusClientOptions, "baseUrl" | "environment" | "userId" | "context">;
};

type NimbusContextValue = {
  client: NimbusClient;
  ready: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const NimbusContext = createContext<NimbusContextValue | null>(null);

export function NimbusProvider({
  children,
  baseUrl,
  environment,
  userId,
  context,
  clientOptions,
}: NimbusProviderProps) {
  const client = useMemo(
    () =>
      new NimbusClient({
        baseUrl,
        environment,
        userId,
        context,
        ...clientOptions,
      }),
    [baseUrl, environment, userId, context, clientOptions],
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    client
      .waitUntilReady()
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      active = false;
      client.destroy();
    };
  }, [client]);

  const refresh = useCallback(async () => {
    await client.refresh(true);
  }, [client]);

  const value = useMemo(
    () => ({ client, ready, error, refresh }),
    [client, ready, error, refresh],
  );

  return <NimbusContext.Provider value={value}>{children}</NimbusContext.Provider>;
}

export type UseFlagResult<T> = {
  value: T | undefined;
  enabled: boolean;
  variantKey: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useFlag<T = boolean>(
  key: string,
  defaultValue?: T,
): UseFlagResult<T> {
  const ctx = useContext(NimbusContext);
  if (!ctx) {
    throw new Error("useFlag must be used within NimbusProvider");
  }
  const { client, ready, error, refresh } = ctx;
  const [evaluation, setEvaluation] = useState<FlagValue<T> | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }
    setEvaluation(client.evaluate<T>(key, defaultValue));
  }, [client, ready, key, defaultValue]);

  return {
    value: evaluation?.value,
    enabled: evaluation?.enabled ?? false,
    variantKey: evaluation?.variantKey ?? null,
    loading: !ready,
    error,
    refresh,
  };
}

export function useNimbus(): NimbusContextValue {
  const ctx = useContext(NimbusContext);
  if (!ctx) {
    throw new Error("useNimbus must be used within NimbusProvider");
  }
  return ctx;
}

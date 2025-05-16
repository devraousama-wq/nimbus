export type Environment = "development" | "staging" | "production";

export type ProjectId = string & { readonly __brand: unique symbol };

export type UserContext = Record<string, string | number | boolean | string[]>;

export const ENVIRONMENTS: Environment[] = ["development", "staging", "production"];

export function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as string[]).includes(value);
}

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export * from "./flags.js";

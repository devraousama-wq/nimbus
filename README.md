# Nimbus

Self-hosted feature flag and A/B experimentation platform built with TypeScript.

## Overview

Nimbus lets teams define feature flags, target users with rule-based segments, run controlled rollouts, and measure experiments without sending data to third-party SaaS providers.

## Architecture

```
apps/server     Fastify API, evaluation, SSE, webhooks
apps/admin      React admin console (Vite)
packages/shared Types, schemas, environment helpers
packages/rule-engine  Targeting rule evaluation
packages/stats  Experiment statistics
packages/sdk-node     Server-side SDK
packages/sdk-browser  Browser SDK + React hooks
```

## Local setup

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

Server listens on `http://localhost:4100`. Admin UI runs on `http://localhost:5173` after `pnpm dev:admin`.

## Stack

- Node.js 20+, TypeScript 5, Fastify
- PostgreSQL, Redis
- React, Vite, TanStack Query
- Vitest for tests

## License

MIT

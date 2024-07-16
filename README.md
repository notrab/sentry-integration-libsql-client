# sentry-integration-libsql-client

This is a Node integration for Sentry that adds support for `@libsql/client`.

![NPM](https://img.shields.io/npm/v/sentry-integration-libsql-client)

## Install

```bash
npm install sentry-integration-libsql-client
```

Make sure to install `@libsql/client` if you don't already have it.

## Quickstart

```ts
import { createClient } from "@libsql/client";
import * as Sentry from "@sentry/node";
import { libsqlIntegration } from "sentry-integration-libsql-client";

const libsqlClient = createClient({
  url: "...",
  authToken: "...",
});

Sentry.init({
  dsn: "...",
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  integrations: [
    libsqlIntegration(client, Sentry, {
      tracing: true,
      breadcrumbs: true,
      errors: true,
    }),
  ],
});

await libsqlClient.execute("SELECT * FROM users");
```

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
  url: "libsql://...",
  authToken: "...",
});

Sentry.init({
  dsn: "...",
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

## Not yet got a database?

1. [![Create Database](https://sqlite.new/button)](https://sqlite.new)
2. Copy the Database URL, and create an auth token for your database
3. Install the libSQL SDK

```bash
npm install @libsql/client
```

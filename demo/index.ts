import {
  Client,
  createClient,
  InStatement,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import * as Sentry from "@sentry/node";

import { libsqlIntegration } from "../src";

const libsqlClient = createClient({
  url: "file:dev.db",
});

Sentry.init({
  dsn: "...",
  integrations: [
    libsqlIntegration(libsqlClient, Sentry, {
      errors: true,
      breadcrumbs: true,
      tracing: true,
    }),
  ],
});

libsqlClient
  .batch([
    "CREATE TABLE IF NOT EXISTS users (name TEXT)",
    "INSERT INTO users (name) VALUES ('Jamie')",
  ])
  .then(console.log);
libsqlClient.execute("SELECT * FROM users").then(console.log);

// uncomment to invoke error
// libsqlClient.execute("SELECT * FROM tabledoesntexist").then(console.log);

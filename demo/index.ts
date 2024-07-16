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
  url: "libsql://...",
  authToken: "...",
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
  .execute("CREATE TABLE IF NOT EXISTS users (name)")
  .then(console.log);
libsqlClient
  .execute(`INSERT INTO users (name) VALUES ("Jamie")`)
  .then(console.log);
libsqlClient.execute("SELECT * FROM users").then(console.log);
libsqlClient.execute("SELECT * FROM tabledoesntexist").then(console.log);

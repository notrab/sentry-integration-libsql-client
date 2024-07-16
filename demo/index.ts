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
  dsn: "https://ccf1d142a24db91da5e0d3926277f6fe@o4507576416403456.ingest.de.sentry.io/4507576457560144",
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
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

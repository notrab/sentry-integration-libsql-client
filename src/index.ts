import {
  Client,
  InStatement,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { getStatementType } from "sqlite-statement-type";
import type { Integration, Span } from "@sentry/types";

export interface LibSQLIntegrationOptions {
  tracing?: boolean;
  breadcrumbs?: boolean;
  errors?: boolean;
}

const DEFAULT_OPTIONS: LibSQLIntegrationOptions = {
  tracing: true,
  breadcrumbs: true,
  errors: true,
};

export function libsqlIntegration(
  client: Client,
  Sentry: any,
  userOptions: LibSQLIntegrationOptions = {}
): Integration {
  if (!client || typeof client !== "object") {
    throw new Error("libSQL `Client` instance is required");
  }

  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  return {
    name: "libSQLIntegration",
    setupOnce(): void {
      const originalExecute = client.execute;

      client.execute = function (stmt: InStatement) {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        const statementType = getStatementType(sql);

        const executeOperation = async (span?: Span) => {
          if (options.breadcrumbs) {
            Sentry.addBreadcrumb({
              category: "libsql",
              message: "Executing SQL statement",
              data: { sql },
            });
          }

          try {
            const result = await originalExecute.call(this, stmt);

            if (span) {
              span.setAttribute("rows_affected", result.rowsAffected);
            }

            return result;
          } catch (error) {
            if (span) {
              span.setStatus({ code: 2 });
            }

            if (options.errors) {
              Sentry.captureException(error);
            }

            throw error;
          }
        };

        if (options.tracing) {
          return Sentry.startSpan(
            {
              op: `db.${statementType}`,
              name: "libsql.execute",
            },
            executeOperation
          );
        } else {
          return executeOperation();
        }
      };

      const originalTransaction = client.transaction;
      function wrappedTransaction(): Promise<Transaction>;
      function wrappedTransaction(mode: TransactionMode): Promise<Transaction>;
      function wrappedTransaction(
        mode?: TransactionMode
      ): Promise<Transaction> {
        const transactionOperation = async (parentSpan?: Span) => {
          if (options.breadcrumbs) {
            Sentry.addBreadcrumb({
              category: "libsql",
              message: "Starting transaction",
              data: { mode },
            });
          }

          try {
            const transaction =
              mode === undefined
                ? await originalTransaction.call(client)
                : // @ts-expect-error
                  await originalTransaction.call(client, mode);

            const originalExecute = transaction.execute;
            transaction.execute = function (stmt: InStatement) {
              return client.execute.call(this, stmt);
            };

            const originalCommit = transaction.commit;
            transaction.commit = function () {
              const commitOperation = async (span?: Span) => {
                if (options.breadcrumbs) {
                  Sentry.addBreadcrumb({
                    category: "libsql",
                    message: "Committing transaction",
                  });
                }

                try {
                  const result = await originalCommit.call(this);

                  if (span) {
                    span.setStatus({ code: 1 });
                  }
                  if (parentSpan) {
                    parentSpan.setStatus({ code: 1 });
                  }

                  return result;
                } catch (error) {
                  if (span) {
                    span.setStatus({ code: 2 });
                  }
                  if (parentSpan) {
                    parentSpan.setStatus({ code: 2 });
                  }

                  if (options.errors) {
                    Sentry.captureException(error);
                  }

                  throw error;
                }
              };

              if (options.tracing) {
                return Sentry.startSpan(
                  {
                    op: "db.commit",
                    name: "libsql.transaction.commit",
                    parentSpan: parentSpan,
                  },
                  commitOperation
                );
              } else {
                return commitOperation();
              }
            };

            const originalRollback = transaction.rollback;
            transaction.rollback = function () {
              const rollbackOperation = async (span?: Span) => {
                if (options.breadcrumbs) {
                  Sentry.addBreadcrumb({
                    category: "libsql",
                    message: "Rolling back transaction",
                  });
                }

                try {
                  const result = await originalRollback.call(this);

                  if (span) {
                    span.setStatus({ code: 1 });
                  }
                  if (parentSpan) {
                    parentSpan.setStatus({ code: 1 });
                  }

                  return result;
                } catch (error) {
                  if (span) {
                    span.setStatus({ code: 2 });
                  }
                  if (parentSpan) {
                    parentSpan.setStatus({ code: 2 });
                  }

                  if (options.errors) {
                    Sentry.captureException(error);
                  }

                  throw error;
                }
              };

              if (options.tracing) {
                return Sentry.startSpan(
                  {
                    op: "db.rollback",
                    name: "libsql.transaction.rollback",
                    parentSpan: parentSpan,
                  },
                  rollbackOperation
                );
              } else {
                return rollbackOperation();
              }
            };

            return transaction;
          } catch (error) {
            if (parentSpan) {
              parentSpan.setStatus({ code: 2 });
            }

            if (options.errors) {
              Sentry.captureException(error);
            }

            throw error;
          }
        };

        if (options.tracing) {
          return Sentry.startSpan(
            {
              op: "db.transaction",
              name: `libsql.transaction.${mode || "write"}`,
            },
            transactionOperation
          );
        } else {
          return transactionOperation();
        }
      }

      client.transaction = wrappedTransaction;
    },
  };
}

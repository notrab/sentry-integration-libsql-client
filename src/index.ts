import {
  Client,
  InStatement,
  ResultSet,
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
              span.setStatus({ code: 1 });
            }

            if (options.breadcrumbs) {
              Sentry.addBreadcrumb({
                category: "libsql",
                message: "SQL statement executed successfully",
                data: { sql, rowsAffected: result.rowsAffected },
              });
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

      const originalBatch = client.batch;
      client.batch = function (stmts: InStatement[]) {
        const batchOperation = async (parentSpan?: Span) => {
          if (options.breadcrumbs) {
            Sentry.addBreadcrumb({
              category: "libsql",
              message: "Starting batch SQL operation",
              data: { stmtCount: stmts.length },
            });
          }

          try {
            const results = await Sentry.startSpan(
              {
                op: "db.batch",
                name: "libsql.batch",
                parentSpan: parentSpan,
              },
              async (batchSpan: Span) => {
                const statementResults: ResultSet[] = [];

                for (let i = 0; i < stmts.length; i++) {
                  const stmt = stmts[i];
                  const sql = typeof stmt === "string" ? stmt : stmt.sql;
                  const statementType = getStatementType(sql);

                  await Sentry.startSpan(
                    {
                      op: `db.${statementType}`,
                      name: `libsql.batch.statement.${i}`,
                      parentSpan: batchSpan,
                    },
                    async (statementSpan: Span) => {
                      try {
                        const result = await originalExecute.call(this, stmt);
                        statementResults.push(result);

                        if (statementSpan) {
                          statementSpan.setAttribute(
                            "rows_affected",
                            result.rowsAffected
                          );
                          statementSpan.setStatus({ code: 1 }); // Set success status
                        }

                        if (options.breadcrumbs) {
                          Sentry.addBreadcrumb({
                            category: "libsql",
                            message: `Batch statement ${i} executed successfully`,
                            data: { sql, rowsAffected: result.rowsAffected },
                          });
                        }
                      } catch (error) {
                        if (statementSpan) {
                          statementSpan.setStatus({ code: 2 });
                        }

                        if (options.errors) {
                          Sentry.captureException(error);
                        }

                        throw error;
                      }
                    }
                  );
                }

                return statementResults;
              }
            );

            if (parentSpan) {
              parentSpan.setAttribute("statements_count", stmts.length);
              parentSpan.setStatus({ code: 1 }); // Set success status
            }

            if (options.breadcrumbs) {
              Sentry.addBreadcrumb({
                category: "libsql",
                message: "Batch SQL operation completed successfully",
                data: { stmtCount: stmts.length },
              });
            }

            return results;
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
              op: "db.batch",
              name: "libsql.batch",
            },
            batchOperation
          );
        } else {
          return batchOperation();
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

                  if (options.breadcrumbs) {
                    Sentry.addBreadcrumb({
                      category: "libsql",
                      message: "Transaction committed successfully",
                    });
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
                    parentSpan,
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

                  if (options.breadcrumbs) {
                    Sentry.addBreadcrumb({
                      category: "libsql",
                      message: "Transaction rolled back successfully",
                    });
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
                    parentSpan,
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

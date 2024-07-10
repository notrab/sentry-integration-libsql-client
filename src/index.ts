import {
  Client,
  InStatement,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { getStatementType } from "sqlite-statement-type";
import type { Integration, Span } from "@sentry/types";

export function libsqlIntegration(client: Client, Sentry: any): Integration {
  if (!client || typeof client !== "object") {
    throw new Error("libSQL `Client` instance is required");
  }

  return {
    name: "libSQLIntegration",
    setupOnce(): void {
      const originalExecute = client.execute;
      client.execute = function (stmt: InStatement) {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        const statementType = getStatementType(sql);

        return Sentry.startSpan(
          {
            op: `db.${statementType}`,
            name: "libsql.execute",
          },
          async (span: Span) => {
            Sentry.addBreadcrumb({
              category: "libsql",
              message: "Executing SQL statement",
              data: {
                sql: typeof stmt === "string" ? stmt : stmt.sql,
              },
            });

            try {
              const result = await originalExecute.call(this, stmt);

              span?.setAttribute("rows_affected", result.rowsAffected);

              return result;
            } catch (error) {
              span?.setStatus({ code: 2 });

              Sentry.captureException(error);

              throw error;
            }
          },
        );
      };

      const originalTransaction = client.transaction;
      function wrappedTransaction(): Promise<Transaction>;
      function wrappedTransaction(mode: TransactionMode): Promise<Transaction>;
      function wrappedTransaction(
        mode?: TransactionMode,
      ): Promise<Transaction> {
        return Sentry.startSpan(
          {
            op: "db.transaction",
            name: `libsql.transaction.${mode || "write"}`,
          },
          async (parentSpan: Span) => {
            Sentry.addBreadcrumb({
              category: "libsql",
              message: "Starting transaction",
              data: { mode },
            });

            try {
              const transaction =
                mode === undefined
                  ? await originalTransaction.call(client)
                  : // @ts-expect-error
                    await originalTransaction.call(client, mode);

              const originalExecute = transaction.execute;
              transaction.execute = function (stmt: InStatement) {
                const sql = typeof stmt === "string" ? stmt : stmt.sql;
                const statementType = getStatementType(sql);

                return Sentry.startSpan(
                  {
                    op: `db.${statementType}`,
                    name: "libsql.transaction.execute",
                    parentSpan: parentSpan,
                  },
                  async (span: Span) => {
                    Sentry.addBreadcrumb({
                      category: "libsql",
                      message: "Executing SQL statement in transaction",
                      data: {
                        sql: typeof stmt === "string" ? stmt : stmt.sql,
                      },
                    });

                    try {
                      const result = await originalExecute.call(this, stmt);

                      span?.setAttribute("rows_affected", result.rowsAffected);

                      return result;
                    } catch (error) {
                      span?.setStatus({ code: 2 });

                      Sentry.captureException(error);

                      throw error;
                    }
                  },
                );
              };

              const originalCommit = transaction.commit;
              transaction.commit = function () {
                return Sentry.startSpan(
                  {
                    op: "db.commit",
                    name: "libsql.transaction.commit",
                    parentSpan: parentSpan,
                  },
                  async (span: Span) => {
                    Sentry.addBreadcrumb({
                      category: "libsql",
                      message: "Committing transaction",
                    });

                    try {
                      const result = await originalCommit.call(this);

                      span?.setStatus({ code: 1 });
                      parentSpan?.setStatus({ code: 1 });

                      return result;
                    } catch (error) {
                      span?.setStatus({ code: 2 });
                      parentSpan?.setStatus({ code: 2 });

                      Sentry.captureException(error);

                      throw error;
                    }
                  },
                );
              };

              const originalRollback = transaction.rollback;
              transaction.rollback = function () {
                return Sentry.startSpan(
                  {
                    op: "db.rollback",
                    name: "libsql.transaction.rollback",
                    parentSpan: parentSpan,
                  },
                  async (span: Span) => {
                    Sentry.addBreadcrumb({
                      category: "libsql",
                      message: "Rolling back transaction",
                    });

                    try {
                      const result = await originalRollback.call(this);

                      span?.setStatus({ code: 1 });
                      parentSpan?.setStatus({ code: 1 });

                      return result;
                    } catch (error) {
                      span?.setStatus({ code: 2 });
                      parentSpan?.setStatus({ code: 2 });

                      Sentry.captureException(error);

                      throw error;
                    }
                  },
                );
              };

              return transaction;
            } catch (error) {
              parentSpan?.setStatus({ code: 2 });

              Sentry.captureException(error);

              throw error;
            }
          },
        );
      }

      client.transaction = wrappedTransaction;
    },
  };
}

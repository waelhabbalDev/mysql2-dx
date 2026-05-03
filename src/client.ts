import mysql from "mysql2/promise";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { z, ZodType } from "zod";
import { DatabaseError, NotFoundError, ValidationError } from "./errors";
import logger, { LogEntry } from "./utils/logger";
import {
  DatabaseClientOptions,
  MySQLPrimitive,
  QueryParameters,
  QueryRunner,
  BatchOperation,
  UnsafeQueryResult,
  WhereCondition,
  ParameterizedQuery,
  RawSql,
} from "./types";

/**
 * @deprecated ⚠️ WARNING: Raw SQL expressions bypass all parameterization.
 * Ensure the provided string is completely safe from SQL injection.
 * Prefer using parameterized values instead.
 */
export const sql = (expression: string): RawSql => ({
  _isRawSql: true,
  value: expression,
});

const operatorMap: Record<string, string> = {
  equals: "=",
  not: "!=",
  in: "IN",
  notIn: "NOT IN",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  contains: "LIKE",
  startsWith: "LIKE",
  endsWith: "LIKE",
};

function isRawSql(value: any): value is RawSql {
  return (
    typeof value === "object" && value !== null && value._isRawSql === true
  );
}

function isParameterizedQuery(op: BatchOperation): op is ParameterizedQuery {
  return "sql" in op;
}

/** @internal */
class Transaction implements QueryRunner {
  constructor(
    private readonly client: DatabaseClient,
    private readonly conn: PoolConnection,
  ) {}

  selectSingle = <T extends ZodType>(q: string, p: QueryParameters, s: T) =>
    this.client.selectSingle(q, p, s, this.conn);
  selectSingleOrDefault = <T extends ZodType>(
    q: string,
    p: QueryParameters,
    s: T,
  ) => this.client.selectSingleOrDefault(q, p, s, this.conn);
  selectMany = <T extends ZodType>(q: string, p: QueryParameters, s: T) =>
    this.client.selectMany(q, p, s, this.conn);
  modify = (q: string, p: QueryParameters) =>
    this.client.modify(q, p, this.conn);
  insert = (t: string, d: Record<string, MySQLPrimitive>) =>
    this.client.insert(t, d, this.conn);
  insertMany = (t: string, d: Record<string, MySQLPrimitive>[]) =>
    this.client.insertMany(t, d, this.conn);
  update = (t: string, d: Record<string, MySQLPrimitive>, w: WhereCondition) =>
    this.client.update(t, d, w, this.conn);
  delete = (t: string, w: WhereCondition) =>
    this.client.delete(t, w, this.conn);
  selectSingleUnsafe = (q: string, p: QueryParameters) =>
    this.client.selectSingleUnsafe(q, p, this.conn);
  selectSingleOrDefaultUnsafe = (q: string, p: QueryParameters) =>
    this.client.selectSingleOrDefaultUnsafe(q, p, this.conn);
  selectManyUnsafe = (q: string, p: QueryParameters) =>
    this.client.selectManyUnsafe(q, p, this.conn);
  executeBatchUnsafe = (ops: BatchOperation[]) =>
    this.client.executeBatchUnsafe(ops, this.conn);
  executeBatch = <const T extends readonly ZodType[]>(
    ops: BatchOperation[],
    s: T,
  ) => this.client.executeBatch(ops, s, this.conn);
  executeTransaction = <T>(
    callback: (trx: QueryRunner) => Promise<T>,
  ): Promise<T> => {
    return callback(this);
  };
  close = (): Promise<void> => {
    return Promise.resolve();
  };
}

/**
 * Main database client with built‑in Zod validation, transaction support,
 * batch operations, and a Prisma‑style where condition builder.
 *
 * All methods are fully parameterized to prevent SQL injection.
 * Raw SQL expressions can be used via the `sql()` helper, but it is
 * deprecated due to security risks.
 *
 * @example
 * const db = createDatabaseClient({ config: {...} });
 *
 * // Insert a user
 * const result = await db.insert('users', { name: 'Alice', age: 30 });
 *
 * // Select with Zod validation
 * const user = await db.selectSingle(
 *   'SELECT * FROM users WHERE id = ?',
 *   [1],
 *   z.object({ id: z.number(), name: z.string() })
 * );
 *
 * // Update using a rich where condition
 * await db.update('users', { age: 31 }, { name: 'Alice' });
 *
 * // Transaction
 * await db.executeTransaction(async (trx) => {
 *   await trx.insert('logs', { message: 'update started' });
 *   await trx.update('users', { age: 32 }, { name: 'Alice' });
 * });
 */
export class DatabaseClient implements QueryRunner {
  private readonly pool: Pool;
  private readonly verbose: boolean;

  public static readonly MODIFY_SCHEMA = z.custom<ResultSetHeader>(
    (val): val is ResultSetHeader =>
      typeof val === "object" && val !== null && "affectedRows" in val,
    "Expected a ResultSetHeader for a modify operation.",
  );

  constructor(options: DatabaseClientOptions) {
    const { config, verbose = false } = options;
    this.verbose = verbose;
    this.log({ type: "info", message: "Initializing DatabaseClient..." });
    try {
      this.pool = mysql.createPool(config);
      this.log({
        type: "info",
        message: "Database connection pool created successfully.",
      });
    } catch (error) {
      const errorMessage = "Failed to initialize database pool.";
      this.log({
        type: "error",
        message: `${errorMessage} Details: ${(error as Error).message}`,
      });
      throw new DatabaseError(errorMessage, error);
    }
  }

  private log = (
    entry: Omit<LogEntry, "type"> & { type: LogEntry["type"] },
  ) => {
    if (this.verbose) {
      logger.log(entry);
    }
  };

  private _buildSetClause(data: Record<string, MySQLPrimitive | RawSql>): {
    sql: string;
    params: MySQLPrimitive[];
  } {
    const setClauses: string[] = [];
    const params: MySQLPrimitive[] = [];

    for (const key of Object.keys(data)) {
      const value = data[key];

      if (isRawSql(value)) {
        setClauses.push(`?? = ${value.value}`);
        params.push(key);
      } else {
        setClauses.push("?? = ?");
        params.push(key, value as MySQLPrimitive);
      }
    }

    if (setClauses.length === 0) {
      throw new DatabaseError("Update data cannot be empty.");
    }

    return { sql: setClauses.join(", "), params };
  }

  private _buildWhereClause(where: WhereCondition): {
    sql: string;
    params: MySQLPrimitive[];
  } {
    const conditions: string[] = [];
    const params: MySQLPrimitive[] = [];

    for (const key of Object.keys(where)) {
      const value = where[key as keyof typeof where];
      if (key === "OR" || key === "AND") {
        const clauses = (value as WhereCondition[])
          .map((condition) => {
            const sub = this._buildWhereClause(condition);
            params.push(...sub.params);
            return `(${sub.sql})`;
          })
          .join(` ${key} `);
        conditions.push(`(${clauses})`);
      } else if (key === "NOT") {
        const sub = this._buildWhereClause(value as WhereCondition);
        params.push(...sub.params);
        conditions.push(`NOT (${sub.sql})`);
      } else {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          for (const op of Object.keys(value)) {
            const opValue = (value as any)[op];
            const sqlOp = operatorMap[op];
            if (!sqlOp) throw new DatabaseError(`Unsupported operator: ${op}`);

            if (
              (op === "in" || op === "notIn") &&
              Array.isArray(opValue) &&
              opValue.length === 0
            ) {
              if (op === "in") {
                conditions.push("1=0");
              } else {
                conditions.push("1=1");
              }
              continue;
            }

            if (op === "in" || op === "notIn") {
              conditions.push(`?? ${sqlOp} (?)`);
            } else {
              conditions.push(`?? ${sqlOp} ?`);
            }
            params.push(key);
            if (op === "contains") params.push(`%${opValue}%`);
            else if (op === "startsWith") params.push(`${opValue}%`);
            else if (op === "endsWith") params.push(`%${opValue}`);
            else params.push(opValue);
          }
        } else {
          conditions.push("?? = ?");
          params.push(key, value as MySQLPrimitive);
        }
      }
    }
    if (conditions.length === 0) return { sql: "1=1", params: [] };
    return { sql: conditions.join(" AND "), params };
  }

  private async _executeQuery(
    executor: Pool | PoolConnection,
    query: string,
    params: QueryParameters,
  ) {
    const shouldLog = this.verbose && process.env.NODE_ENV !== "production";

    if (!shouldLog) {
      return executor.query(query, params);
    }

    const startTime = performance.now();
    const formattedQuery = mysql.format(
      query,
      Array.isArray(params) ? params : [params],
    );
    this.log({ type: "query", message: formattedQuery });

    try {
      const result = await executor.query(query, params);
      const duration = (performance.now() - startTime).toFixed(2);
      const [rows] = result;

      let successMessage: string;
      if (Array.isArray(rows)) {
        const rowCount = rows.length;
        successMessage = `(${rowCount} ${
          rowCount === 1 ? "row" : "rows"
        } returned, ${duration}ms)`;
      } else {
        const affectedRows = (rows as ResultSetHeader).affectedRows ?? 0;
        successMessage = `(${affectedRows} ${
          affectedRows === 1 ? "row" : "rows"
        } affected, ${duration}ms)`;
      }
      this.log({ type: "success", message: successMessage });
      return result;
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      this.log({
        type: "error",
        message: `Query failed after ${duration}ms. Details: ${(error as Error).message}`,
      });
      throw new DatabaseError(
        `Query failed: ${(error as Error).message}`,
        error,
      );
    }
  }
  public async selectSingle<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
    connection?: PoolConnection,
  ): Promise<z.infer<T>> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows) || rows.length === 0) throw new NotFoundError();
    const result = schema.safeParse(rows[0]);
    if (!result.success)
      throw new ValidationError(
        "Failed to validate single record",
        result.error,
      );
    return result.data;
  }

  public async selectSingleOrDefault<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
    connection?: PoolConnection,
  ): Promise<z.infer<T> | null> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const result = schema.safeParse(rows[0]);
    if (!result.success)
      throw new ValidationError(
        "Failed to validate single record",
        result.error,
      );
    return result.data;
  }

  public async selectMany<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
    connection?: PoolConnection,
  ): Promise<z.infer<T>[]> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows))
      throw new DatabaseError("Query did not return an array of rows.");
    const result = z.array(schema).safeParse(rows);
    if (!result.success)
      throw new ValidationError(
        "Failed to validate one or more records",
        result.error,
      );
    return result.data;
  }

  public async modify(
    query: string,
    params: QueryParameters,
    connection?: PoolConnection,
  ): Promise<ResultSetHeader> {
    const [result] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    return result as ResultSetHeader;
  }

  public async insert(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>,
    connection?: PoolConnection,
  ): Promise<ResultSetHeader> {
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new DatabaseError("Invalid table name.");
    }
    if (Object.keys(data).length === 0) {
      throw new DatabaseError("Insert data cannot be empty.");
    }

    const columns: string[] = [];
    const valuePlaceholders: string[] = [];
    const values: MySQLPrimitive[] = [];

    for (const key of Object.keys(data)) {
      columns.push(key);
      const value = data[key];

      if (isRawSql(value)) {
        valuePlaceholders.push(value.value);
      } else {
        valuePlaceholders.push("?");
        values.push(value as MySQLPrimitive);
      }
    }

    const sql = `INSERT INTO ?? (??) VALUES (${valuePlaceholders.join(", ")});`;
    const params = [table, columns, ...values];

    return this.modify(sql, params, connection);
  }

  public async insertMany(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>[],
    connection?: PoolConnection,
  ): Promise<ResultSetHeader> {
    if (!/^[a-zA-Z0-9_]+$/.test(table))
      throw new DatabaseError("Invalid table name.");
    if (!Array.isArray(data) || data.length === 0)
      throw new DatabaseError("Insert data must be a non-empty array.");

    const columns = Object.keys(data[0]);
    if (columns.length === 0)
      throw new DatabaseError("Data objects for insertMany cannot be empty.");

    const hasRawSql = data.some((row) =>
      Object.values(row).some((val) => isRawSql(val)),
    );

    if (!hasRawSql) {
      this.log({
        type: "info",
        message: "Using optimized path for insertMany (no raw SQL).",
      });

      const values = data.map((row) =>
        columns.map((col) => {
          if (!(col in row)) {
            throw new DatabaseError(
              `Inconsistent shape in insertMany data: object is missing key '${col}'.`,
            );
          }
          return (row as Record<string, MySQLPrimitive>)[col];
        }),
      );
      const sql = `INSERT INTO ?? (??) VALUES ?`;
      return this.modify(sql, [table, columns, values], connection);
    }

    this.log({
      type: "info",
      message: "Using manual query builder for insertMany due to raw SQL.",
    });

    const valuePlaceholders: string[] = [];
    const params: MySQLPrimitive[] = [];

    for (const row of data) {
      const rowValuePlaceholders: string[] = [];
      for (const col of columns) {
        if (!(col in row)) {
          throw new DatabaseError(
            `Inconsistent shape in insertMany data: object is missing key '${col}'.`,
          );
        }

        const value = row[col];
        if (isRawSql(value)) {
          rowValuePlaceholders.push(value.value);
        } else {
          rowValuePlaceholders.push("?");
          params.push(value as MySQLPrimitive);
        }
      }
      valuePlaceholders.push(`(${rowValuePlaceholders.join(", ")})`);
    }

    const sql = `INSERT INTO ?? (??) VALUES ${valuePlaceholders.join(", ")}`;
    return this.modify(sql, [table, columns, ...params], connection);
  }

  public async update(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>,
    where: WhereCondition,
    connection?: PoolConnection,
  ): Promise<ResultSetHeader> {
    if (!/^[a-zA-Z0-9_]+$/.test(table))
      throw new DatabaseError("Invalid table name.");
    if (Object.keys(data).length === 0)
      throw new DatabaseError("Update data cannot be empty.");
    if (Object.keys(where).length === 0)
      throw new DatabaseError(
        "Update 'where' clause cannot be empty. For safety, use a condition like `{ id: { gt: 0 } }` to update all rows.",
      );
    const { sql: setSql, params: setParams } = this._buildSetClause(data);
    const { sql: whereSql, params: whereParams } =
      this._buildWhereClause(where);

    const sql = `UPDATE ?? SET ${setSql} WHERE ${whereSql}`;
    const params = [table, ...setParams, ...whereParams];

    return this.modify(sql, params, connection);
  }

  public async delete(
    table: string,
    where: WhereCondition,
    connection?: PoolConnection,
  ): Promise<ResultSetHeader> {
    if (!/^[a-zA-Z0-9_]+$/.test(table))
      throw new DatabaseError("Invalid table name.");
    if (Object.keys(where).length === 0)
      throw new DatabaseError(
        "Delete 'where' clause cannot be empty. For safety, use a condition like `{ id: { gt: 0 } }` to delete all rows.",
      );
    const { sql: whereSql, params: whereParams } =
      this._buildWhereClause(where);
    const sql = `DELETE FROM ?? WHERE ${whereSql}`;
    const params = [table, ...whereParams];
    return this.modify(sql, params, connection);
  }

  public async selectSingleUnsafe(
    query: string,
    params: QueryParameters,
    connection?: PoolConnection,
  ): Promise<RowDataPacket> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows) || rows.length === 0)
      throw new NotFoundError("Record not found (unsafe search).");
    return rows[0] as RowDataPacket;
  }

  public async selectSingleOrDefaultUnsafe(
    query: string,
    params: QueryParameters,
    connection?: PoolConnection,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as RowDataPacket;
  }

  public async selectManyUnsafe(
    query: string,
    params: QueryParameters,
    connection?: PoolConnection,
  ): Promise<RowDataPacket[]> {
    const [rows] = await this._executeQuery(
      connection ?? this.pool,
      query,
      params,
    );
    if (!Array.isArray(rows))
      throw new DatabaseError(
        "Query did not return an array of rows (unsafe search).",
      );
    return rows as RowDataPacket[];
  }

  public async executeTransaction<T>(
    callback: (trx: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    this.log({ type: "info", message: "Transaction started." });
    await connection.beginTransaction();
    const trx = new Transaction(this, connection);
    try {
      const result = await callback(trx);
      await connection.commit();
      this.log({
        type: "success",
        message: "Transaction committed successfully.",
      });
      return result;
    } catch (error) {
      await connection.rollback();
      this.log({
        type: "error",
        message: "Transaction rolled back due to an error.",
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  public async executeBatchUnsafe(
    operations: BatchOperation[],
    connection?: PoolConnection,
  ): Promise<UnsafeQueryResult[]> {
    if (operations.length === 0) return [];
    const executor = connection ?? (await this.pool.getConnection());
    const isManagingTransaction = !connection;
    if (isManagingTransaction)
      await (executor as PoolConnection).beginTransaction();
    try {
      const results: UnsafeQueryResult[] = [];
      for (const op of operations) {
        let sql: string;
        let params: QueryParameters;
        if (isParameterizedQuery(op)) {
          sql = op.sql;
          params = op.params || [];
        } else {
          switch (op.op) {
            case "insert": {
              if (Array.isArray(op.data)) {
                const columns = Object.keys(op.data[0]);
                const values = op.data.map((row) =>
                  columns.map((col) => row[col]),
                );
                sql = `INSERT INTO ?? (??) VALUES ?`;
                params = [op.table, columns, values];
              } else {
                sql = `INSERT INTO ?? SET ?`;
                params = [op.table, op.data];
              }
              break;
            }
            case "update": {
              const { sql: whereSql, params: whereParams } =
                this._buildWhereClause(op.where);
              sql = `UPDATE ?? SET ? WHERE ${whereSql}`;
              params = [op.table, op.data, ...whereParams];
              break;
            }
            case "delete": {
              const { sql: whereSql, params: whereParams } =
                this._buildWhereClause(op.where);
              sql = `DELETE FROM ?? WHERE ${whereSql}`;
              params = [op.table, ...whereParams];
              break;
            }
          }
        }
        const [result] = await this._executeQuery(executor, sql, params);
        results.push(result as UnsafeQueryResult);
      }
      if (isManagingTransaction) await (executor as PoolConnection).commit();
      return results;
    } catch (error) {
      if (isManagingTransaction) await (executor as PoolConnection).rollback();
      throw error;
    } finally {
      if (isManagingTransaction) (executor as PoolConnection).release();
    }
  }

  public async executeBatch<const T extends readonly ZodType[]>(
    operations: BatchOperation[],
    schemas: T,
    connection?: PoolConnection,
  ): Promise<{ -readonly [K in keyof T]: z.infer<T[K]> }> {
    if (operations.length !== schemas.length) {
      throw new DatabaseError(
        `Batch query failed: The number of operations (${operations.length}) must match the number of schemas (${schemas.length}).`,
      );
    }
    const rawResults = await this.executeBatchUnsafe(operations, connection);
    const validatedResults = rawResults.map((result, index) => {
      const schema = schemas[index];
      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        const op = operations[index];
        const opIdentifier = isParameterizedQuery(op)
          ? op.sql.substring(0, 50)
          : `${op.op} on ${op.table}`;
        throw new ValidationError(
          `Validation failed for operation #${
            index + 1
          } ('${opIdentifier}...')`,
          parsed.error,
        );
      }
      return parsed.data;
    });
    return validatedResults as { -readonly [K in keyof T]: z.infer<T[K]> };
  }

  public async close(): Promise<void> {
    this.log({ type: "info", message: "Closing database connection pool." });
    await this.pool.end();
  }
}

/**
 * Creates a new instance of the DatabaseClient.
 * This is the recommended entry point for using the library.
 *
 * @param options - Configuration options.
 * @param options.config - A complete `mysql2/promise` pool configuration object.
 * @param [options.verbose=false] - If `true`, enables detailed logging of queries and results.
 *                                   **Note:** Logging is automatically disabled in production
 *                                   (when `process.env.NODE_ENV === "production"`), regardless of this flag.
 * @returns A configured DatabaseClient instance.
 *
 * @example
 * import { createDatabaseClient } from 'mysql2-dx';
 *
 * const db = createDatabaseClient({
 *   config: {
 *     host: 'localhost',
 *     user: 'root',
 *     password: 'secret',
 *     database: 'myapp',
 *   },
 *   verbose: true, // logs only in non‑production environments
 * });
 */
export const createDatabaseClient = (options: DatabaseClientOptions) =>
  new DatabaseClient(options);

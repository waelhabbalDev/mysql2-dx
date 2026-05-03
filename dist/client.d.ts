import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";
import { DatabaseClientOptions, MySQLPrimitive, QueryParameters, QueryRunner, BatchOperation, UnsafeQueryResult, WhereCondition, RawSql } from "./types";
/**
 * @deprecated ⚠️ WARNING: Raw SQL expressions bypass all parameterization.
 * Ensure the provided string is completely safe from SQL injection.
 * Prefer using parameterized values instead.
 */
export declare const sql: (expression: string) => RawSql;
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
export declare class DatabaseClient implements QueryRunner {
    private readonly pool;
    private readonly verbose;
    static readonly MODIFY_SCHEMA: z.ZodCustom<mysql.ResultSetHeader, mysql.ResultSetHeader>;
    constructor(options: DatabaseClientOptions);
    private log;
    private _buildSetClause;
    private _buildWhereClause;
    private _executeQuery;
    selectSingle<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>>;
    selectSingleOrDefault<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T> | null>;
    selectMany<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>[]>;
    modify(query: string, params: QueryParameters, connection?: PoolConnection): Promise<ResultSetHeader>;
    insert(table: string, data: Record<string, MySQLPrimitive | RawSql>, connection?: PoolConnection): Promise<ResultSetHeader>;
    insertMany(table: string, data: Record<string, MySQLPrimitive | RawSql>[], connection?: PoolConnection): Promise<ResultSetHeader>;
    update(table: string, data: Record<string, MySQLPrimitive | RawSql>, where: WhereCondition, connection?: PoolConnection): Promise<ResultSetHeader>;
    delete(table: string, where: WhereCondition, connection?: PoolConnection): Promise<ResultSetHeader>;
    selectSingleUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket>;
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket | null>;
    selectManyUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket[]>;
    executeTransaction<T>(callback: (trx: QueryRunner) => Promise<T>): Promise<T>;
    executeBatchUnsafe(operations: BatchOperation[], connection?: PoolConnection): Promise<UnsafeQueryResult[]>;
    executeBatch<const T extends readonly ZodType[]>(operations: BatchOperation[], schemas: T, connection?: PoolConnection): Promise<{
        -readonly [K in keyof T]: z.infer<T[K]>;
    }>;
    close(): Promise<void>;
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
export declare const createDatabaseClient: (options: DatabaseClientOptions) => DatabaseClient;

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { z, ZodType } from "zod";
import { DatabaseClientOptions, MySQLPrimitive, QueryParameters, QueryRunner } from "./types";
/**
 * A modern, type-safe MySQL client for Node.js, featuring runtime validation
 * with Zod, a fluent API, and robust transaction management.
 */
export declare class DatabaseClient implements QueryRunner {
    private readonly pool;
    private readonly verbose;
    /**
     * Creates a new instance of the DatabaseClient.
     * @param options Configuration options for the client.
     */
    constructor(options?: DatabaseClientOptions);
    private log;
    private _executeQuery;
    selectSingle<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>>;
    selectSingleOrDefault<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T> | null>;
    selectMany<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>[]>;
    modify(query: string, params: QueryParameters, connection?: PoolConnection): Promise<ResultSetHeader>;
    insert(table: string, data: Record<string, MySQLPrimitive>, connection?: PoolConnection): Promise<ResultSetHeader>;
    update(table: string, data: Record<string, MySQLPrimitive>, where: Record<string, MySQLPrimitive>, connection?: PoolConnection): Promise<ResultSetHeader>;
    delete(table: string, where: Record<string, MySQLPrimitive>, connection?: PoolConnection): Promise<ResultSetHeader>;
    selectSingleUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<unknown>;
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<unknown | null>;
    selectManyUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<unknown[]>;
    /**
     * Executes a series of database operations within a transaction.
     * If the callback function resolves, the transaction is committed.
     * If it throws an error, the transaction is automatically rolled back.
     * The connection is always released back to the pool.
     * @param callback An async function that receives a transactional `QueryRunner` instance.
     * @returns A promise that resolves with the return value of the callback.
     */
    executeTransaction<T>(callback: (trx: QueryRunner) => Promise<T>): Promise<T>;
    /**
     * Gracefully closes the database connection pool.
     */
    close(): Promise<void>;
}
/**
 * Factory function for creating a `DatabaseClient` instance configured from environment variables.
 * @param options Configuration options, excluding `config` and `useEnv`.
 */
export declare const createDatabaseClient: (options?: Omit<DatabaseClientOptions, "config" | "useEnv">) => DatabaseClient;

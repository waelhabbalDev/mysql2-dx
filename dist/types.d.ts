import { PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";
/**
 * Options for constructing a new DatabaseClient instance.
 */
export type DatabaseClientOptions = {
    config?: PoolOptions;
    /**
     * Optional flag to enable verbose logging for database operations.
     * Defaults to `false`.
     */
    verbose?: boolean;
};
/**
 * Represents a single, primitive value that can be safely passed to the mysql2 driver for parameter binding.
 */
export type MySQLPrimitive = string | number | boolean | Date | Buffer | null;
/**
 * Represents the collection of parameters for a query.
 */
export type QueryParameters = (MySQLPrimitive | MySQLPrimitive[] | Record<string, MySQLPrimitive>)[] | Record<string, MySQLPrimitive>;
/**
 * Represents a single, self-contained SQL statement with its parameters, ready for safe execution.
 * This is the primary input for batch operations.
 */
export type ParameterizedQuery = {
    sql: string;
    params?: QueryParameters;
};
/**
 * Represents the raw, unvalidated result of a single query in a batch.
 * It's either an array of raw database rows or a header for modify operations.
 */
export type UnsafeQueryResult = RowDataPacket[] | ResultSetHeader;
/**
 * Defines the contract for an object that can execute database queries,
 * whether it's the main client or a transaction object.
 */
export interface QueryRunner {
    selectSingle<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T>>;
    selectSingleOrDefault<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T> | null>;
    selectMany<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T>[]>;
    modify(query: string, params: QueryParameters): Promise<ResultSetHeader>;
    insert(table: string, data: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    update(table: string, data: Record<string, MySQLPrimitive>, where: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    delete(table: string, where: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    /**
     * [UNSAFE] Selects a single row without Zod validation.
     * @returns A promise that resolves with the raw RowDataPacket from the database.
     */
    selectSingleUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket>;
    /**
     * [UNSAFE] Selects a single row or null, without Zod validation.
     * @returns A promise that resolves with the raw RowDataPacket or null.
     */
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket | null>;
    /**
     * [UNSAFE] Selects multiple rows without Zod validation.
     * @returns A promise that resolves with an array of raw RowDataPacket objects.
     */
    selectManyUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket[]>;
    /**
     * [UNSAFE] Executes a batch of SQL statements in a single network round trip.
     * Returns a raw array of results without Zod validation. Use with caution.
     */
    executeBatchUnsafe(queries: ParameterizedQuery[]): Promise<UnsafeQueryResult[]>;
    /**
     * Executes a batch of SQL statements and validates each result against a corresponding Zod schema.
     * This is the recommended way to run multiple queries safely and efficiently.
     */
    executeBatch<const T extends readonly ZodType[]>(queries: ParameterizedQuery[], schemas: T): Promise<{
        -readonly [K in keyof T]: z.infer<T[K]>;
    }>;
}

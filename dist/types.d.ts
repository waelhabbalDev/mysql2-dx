import { PoolOptions, ResultSetHeader } from "mysql2/promise";
import { z, ZodType } from "zod";
/**
 * Options for constructing a new DatabaseClient instance.
 */
export type DatabaseClientOptions = {
    /**
     * Directly provide a mysql2 PoolOptions object.
     * If provided, `useEnv` is ignored.
     */
    config?: PoolOptions;
    /**
     * If true, loads configuration from environment variables.
     * This is the default behavior if no options are provided.
     * @default true
     */
    useEnv?: boolean;
    /**
     * Enable verbose, colorful query logging including SQL, params, and timing.
     * Useful for debugging.
     * @default false
     */
    verbose?: boolean;
};
/**
 * Represents a single, primitive value that can be safely passed to the mysql2 driver
 * for parameter binding.
 */
export type MySQLPrimitive = string | number | boolean | Date | Buffer | null;
/**
 * Represents the collection of parameters for a query. This can be an array of
 * primitives, nested arrays, or objects, or a single object for named placeholders.
 */
export type QueryParameters = (MySQLPrimitive | MySQLPrimitive[] | Record<string, MySQLPrimitive>)[] | Record<string, MySQLPrimitive>;
/**
 * Defines the contract for an object that can execute database queries,
 * whether it's the main client or a transaction object.
 */
export interface QueryRunner {
    /**
     * Selects a single row and validates its structure against a Zod schema.
     * @param query The SQL query string with '?' placeholders.
     * @param params The parameters to bind to the query.
     * @param schema The Zod schema for validation.
     * @returns A promise that resolves with the validated data object.
     * @throws {NotFoundError} If no rows are found.
     * @throws {ValidationError} If the row data does not match the schema.
     */
    selectSingle<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T>>;
    /**
     * Selects a single row or null if not found, and validates it against a Zod schema.
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @param schema The Zod schema for validation.
     * @returns A promise that resolves with the validated data object or null.
     * @throws {ValidationError} If row data is found but does not match the schema.
     */
    selectSingleOrDefault<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T> | null>;
    /**
     * Selects multiple rows and validates each against a Zod schema.
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @param schema The Zod schema to validate each row.
     * @returns A promise that resolves with an array of validated data objects.
     * @throws {ValidationError} If any row fails validation.
     */
    selectMany<T extends ZodType>(query: string, params: QueryParameters, schema: T): Promise<z.infer<T>[]>;
    /**
     * Executes a statement that modifies data (e.g., complex UPDATES, DELETES, DDL).
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @returns A promise that resolves with the `ResultSetHeader` from the driver.
     */
    modify(query: string, params: QueryParameters): Promise<ResultSetHeader>;
    /**
     * Inserts a single record into a table using a key-value object.
     * @param table The name of the table.
     * @param data An object where keys are column names and values are the data to insert.
     * @returns A promise that resolves with the `ResultSetHeader`, including the insertId.
     */
    insert(table: string, data: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    /**
     * Updates records in a table based on a `where` clause.
     * @param table The name of the table.
     * @param data An object of columns to update.
     * @param where An object specifying the `WHERE` conditions.
     * @returns A promise that resolves with the `ResultSetHeader`, including the number of affected rows.
     */
    update(table: string, data: Record<string, MySQLPrimitive>, where: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    /**
     * Deletes records from a table based on a `where` clause.
     * @param table The name of the table.
     * @param where An object specifying the `WHERE` conditions for deletion.
     * @returns A promise that resolves with the `ResultSetHeader`.
     */
    delete(table: string, where: Record<string, MySQLPrimitive>): Promise<ResultSetHeader>;
    /**
     * [UNSAFE] Selects a single row without Zod validation for maximum performance.
     * Returns `unknown` to force the caller to perform their own type assertion.
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @returns {Promise<unknown>} The raw first row from the database.
     * @throws {NotFoundError} If no rows are found.
     */
    selectSingleUnsafe(query: string, params: QueryParameters): Promise<unknown>;
    /**
     * [UNSAFE] Selects a single row or null, without Zod validation.
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @returns {Promise<unknown | null>} The raw first row from the database or null.
     */
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters): Promise<unknown | null>;
    /**
     * [UNSAFE] Selects multiple rows without Zod validation.
     * @param query The SQL query string.
     * @param params The parameters to bind to the query.
     * @returns {Promise<unknown[]>} An array of raw rows from the database.
     */
    selectManyUnsafe(query: string, params: QueryParameters): Promise<unknown[]>;
}

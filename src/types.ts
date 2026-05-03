import { PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";

/**
 * Configuration options for creating a DatabaseClient instance.
 */
export type DatabaseClientOptions = {
  /**
   * A complete mysql2/promise pool configuration object.
   * See [mysql2 documentation](https://sidorares.github.io/node-mysql2/docs) for all options.
   */
  config: PoolOptions;
  /**
   * Enable verbose logging of SQL queries and results.
   * **Logs are automatically suppressed when `process.env.NODE_ENV === 'production'`**,
   * even if this flag is `true`. Defaults to `false`.
   */
  verbose?: boolean;
};

/**
 * Internal type representing a raw SQL expression.
 * Created by the deprecated `sql()` helper function.
 * @deprecated Use parameterized values instead.
 */
export type RawSql = {
  _isRawSql: true;
  value: string;
};

/**
 * Helper function to wrap a string, marking it as a raw SQL expression
 * to be used in `insert` or `update` data objects.
 *
 * @param expression The raw SQL string.
 * @returns A RawSql object.
 */

/**
 * Represents a single, primitive value that can be safely passed to the mysql2 driver for parameter binding.
 */
export type MySQLPrimitive = string | number | boolean | Date | Buffer | null;

/**
 * Parameters for a raw SQL query.
 * Can be an array of primitives, nested arrays, or an object mapping named placeholders.
 *
 * @example
 * // Positional placeholders
 * db.selectMany('SELECT * FROM users WHERE age > ?', [18]);
 *
 * // Named placeholders (mysql2 option `namedPlaceholders: true`)
 * db.selectMany('SELECT * FROM users WHERE age > :minAge', { minAge: 18 });
 */
export type QueryParameters =
  | (
      | MySQLPrimitive
      | MySQLPrimitive[]
      | MySQLPrimitive[][]
      | Record<string, MySQLPrimitive>
    )[]
  | Record<string, MySQLPrimitive>;

type StringOperators = {
  equals?: string;
  not?: string;
  in?: string[];
  notIn?: string[];
  lt?: string;
  lte?: string;
  gt?: string;
  gte?: string;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
};

type NumericOperators = {
  equals?: number;
  not?: number;
  in?: number[];
  notIn?: number[];
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
};

type ConditionValue = MySQLPrimitive | StringOperators | NumericOperators;

/**
 * Prisma‑like condition object for building complex WHERE clauses.
 * Supports field operators (`equals`, `gt`, `contains`, `in`, etc.) and
 * logical operators (`AND`, `OR`, `NOT`).
 *
 * @example
 * // Simple equality
 * { email: 'user@example.com' }
 *
 * // Operators
 * { age: { gt: 18, lt: 65 } }
 *
 * // String matching
 * { name: { contains: 'John' } }
 *
 * // IN with empty array (safe – becomes 1=0 or 1=1)
 * { role: { in: [] } }
 *
 * // Logical combinations
 * {
 *   AND: [
 *     { age: { gt: 18 } },
 *     { OR: [{ city: 'NYC' }, { city: 'LA' }] }
 *   ]
 * }
 */
export type WhereCondition = {
  OR?: WhereCondition[];
  AND?: WhereCondition[];
  NOT?: WhereCondition | WhereCondition[];
  [key: string]: ConditionValue | WhereCondition[] | WhereCondition | undefined;
};

/**
 * A raw SQL statement with parameters, used in batch operations.
 */
export type ParameterizedQuery = {
  sql: string;
  params?: QueryParameters;
};

/**
 * An insert operation inside a batch.
 */
export type InsertBatchOperation = {
  op: "insert";
  table: string;
  data: Record<string, MySQLPrimitive> | Record<string, MySQLPrimitive>[];
};

/**
 * An update operation inside a batch.
 */
export type UpdateBatchOperation = {
  op: "update";
  table: string;
  data: Record<string, MySQLPrimitive>;
  where: WhereCondition;
};

/**
 * A delete operation inside a batch.
 */
export type DeleteBatchOperation = {
  op: "delete";
  table: string;
  where: WhereCondition;
};

/**
 * Union of all possible batch operations.
 */
export type BatchOperation =
  | ParameterizedQuery
  | InsertBatchOperation
  | UpdateBatchOperation
  | DeleteBatchOperation;

/**
 * Raw result of a batch operation – either an array of rows (for SELECT)
 * or a ResultSetHeader (for INSERT/UPDATE/DELETE).
 */
export type UnsafeQueryResult = RowDataPacket[] | ResultSetHeader;

/**
 * Unified interface for executing queries, whether directly on the client or inside a transaction.
 * All methods accept an optional connection parameter (used internally for transactions).
 */
export interface QueryRunner {
  selectSingle<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
  ): Promise<z.infer<T>>;
  selectSingleOrDefault<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
  ): Promise<z.infer<T> | null>;
  selectMany<T extends ZodType>(
    query: string,
    params: QueryParameters,
    schema: T,
  ): Promise<z.infer<T>[]>;
  modify(query: string, params: QueryParameters): Promise<ResultSetHeader>;
  insert(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>,
  ): Promise<ResultSetHeader>;
  insertMany(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>[],
  ): Promise<ResultSetHeader>;
  update(
    table: string,
    data: Record<string, MySQLPrimitive | RawSql>,
    where: WhereCondition,
  ): Promise<ResultSetHeader>;
  delete(table: string, where: WhereCondition): Promise<ResultSetHeader>;
  selectSingleUnsafe(
    query: string,
    params: QueryParameters,
  ): Promise<RowDataPacket>;
  selectSingleOrDefaultUnsafe(
    query: string,
    params: QueryParameters,
  ): Promise<RowDataPacket | null>;
  selectManyUnsafe(
    query: string,
    params: QueryParameters,
  ): Promise<RowDataPacket[]>;
  executeBatchUnsafe(
    operations: BatchOperation[],
  ): Promise<UnsafeQueryResult[]>;
  executeBatch<const T extends readonly ZodType[]>(
    operations: BatchOperation[],
    schemas: T,
  ): Promise<{ readonly [K in keyof T]: z.infer<T[K]> }>;
  executeTransaction<T>(callback: (trx: QueryRunner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

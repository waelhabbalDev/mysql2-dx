import { PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";
/**
 * Options for constructing a new DatabaseClient instance.
 */
export type DatabaseClientOptions = {
    /**
     * A complete `mysql2` PoolOptions object. This is now **required**.
     */
    config: PoolOptions;
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
 * Represents the collection of parameters for a raw SQL query.
 */
export type QueryParameters = (MySQLPrimitive | MySQLPrimitive[] | MySQLPrimitive[][] | Record<string, MySQLPrimitive>)[] | Record<string, MySQLPrimitive>;
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
 * A rich, object-based structure for building complex WHERE clauses, inspired by Prisma.
 * This version correctly allows for both dynamic field keys and special logical operator keys.
 */
export type WhereCondition = {
    OR?: WhereCondition[];
    AND?: WhereCondition[];
    NOT?: WhereCondition | WhereCondition[];
    [key: string]: ConditionValue | WhereCondition[] | WhereCondition | undefined;
};
/**
 * Represents a single, raw SQL statement with its parameters for use in a batch.
 */
export type ParameterizedQuery = {
    sql: string;
    params?: QueryParameters;
};
/**
 * Represents an insert or insertMany operation within a batch.
 */
export type InsertBatchOperation = {
    op: 'insert';
    table: string;
    data: Record<string, MySQLPrimitive> | Record<string, MySQLPrimitive>[];
};
/**
 * Represents an update operation within a batch, using the rich WhereCondition.
 */
export type UpdateBatchOperation = {
    op: 'update';
    table: string;
    data: Record<string, MySQLPrimitive>;
    where: WhereCondition;
};
/**
 * Represents a delete operation within a batch, using the rich WhereCondition.
 */
export type DeleteBatchOperation = {
    op: 'delete';
    table: string;
    where: WhereCondition;
};
/**
 * A union type representing any valid operation that can be executed in a batch.
 */
export type BatchOperation = ParameterizedQuery | InsertBatchOperation | UpdateBatchOperation | DeleteBatchOperation;
/**
 * Represents the raw, unvalidated result of a single query in a batch.
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
    insertMany(table: string, data: Record<string, MySQLPrimitive>[]): Promise<ResultSetHeader>;
    update(table: string, data: Record<string, MySQLPrimitive>, where: WhereCondition): Promise<ResultSetHeader>;
    delete(table: string, where: WhereCondition): Promise<ResultSetHeader>;
    selectSingleUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket>;
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket | null>;
    selectManyUnsafe(query: string, params: QueryParameters): Promise<RowDataPacket[]>;
    executeBatchUnsafe(operations: BatchOperation[]): Promise<UnsafeQueryResult[]>;
    executeBatch<const T extends readonly ZodType[]>(operations: BatchOperation[], schemas: T): Promise<{
        readonly [K in keyof T]: z.infer<T[K]>;
    }>;
    executeTransaction<T>(callback: (trx: QueryRunner) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
export {};

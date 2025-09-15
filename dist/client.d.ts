import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";
import { DatabaseClientOptions, MySQLPrimitive, QueryParameters, QueryRunner, BatchOperation, UnsafeQueryResult, WhereCondition } from "./types";
export declare class DatabaseClient implements QueryRunner {
    private readonly pool;
    private readonly verbose;
    static readonly MODIFY_SCHEMA: z.ZodCustom<mysql.ResultSetHeader, mysql.ResultSetHeader>;
    constructor(options: DatabaseClientOptions);
    private log;
    private _buildWhereClause;
    private _executeQuery;
    selectSingle<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>>;
    selectSingleOrDefault<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T> | null>;
    selectMany<T extends ZodType>(query: string, params: QueryParameters, schema: T, connection?: PoolConnection): Promise<z.infer<T>[]>;
    modify(query: string, params: QueryParameters, connection?: PoolConnection): Promise<ResultSetHeader>;
    insert(table: string, data: Record<string, MySQLPrimitive>, connection?: PoolConnection): Promise<ResultSetHeader>;
    insertMany(table: string, data: Record<string, MySQLPrimitive>[], connection?: PoolConnection): Promise<ResultSetHeader>;
    update(table: string, data: Record<string, MySQLPrimitive>, where: WhereCondition, connection?: PoolConnection): Promise<ResultSetHeader>;
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
 * @param options - The configuration options, including the mandatory `config` object.
 * @returns A new DatabaseClient instance.
 */
export declare const createDatabaseClient: (options: DatabaseClientOptions) => DatabaseClient;

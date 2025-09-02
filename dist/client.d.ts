import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z, ZodType } from "zod";
import { DatabaseClientOptions, MySQLPrimitive, QueryParameters, QueryRunner, ParameterizedQuery, UnsafeQueryResult } from "./types";
export declare class DatabaseClient implements QueryRunner {
    private readonly pool;
    private readonly verbose;
    static readonly MODIFY_SCHEMA: z.ZodCustom<mysql.ResultSetHeader, mysql.ResultSetHeader>;
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
    selectSingleUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket>;
    selectSingleOrDefaultUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket | null>;
    selectManyUnsafe(query: string, params: QueryParameters, connection?: PoolConnection): Promise<RowDataPacket[]>;
    executeTransaction<T>(callback: (trx: QueryRunner) => Promise<T>): Promise<T>;
    close(): Promise<void>;
    executeBatchUnsafe(queries: ParameterizedQuery[], connection?: PoolConnection): Promise<UnsafeQueryResult[]>;
    executeBatch<const T extends readonly ZodType[]>(queries: ParameterizedQuery[], schemas: T, connection?: PoolConnection): Promise<{
        -readonly [K in keyof T]: z.infer<T[K]>;
    }>;
}
export declare const createDatabaseClient: (options?: Omit<DatabaseClientOptions, "config" | "useEnv">) => DatabaseClient;

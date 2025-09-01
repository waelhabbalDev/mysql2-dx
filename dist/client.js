"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabaseClient = exports.DatabaseClient = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const zod_1 = require("zod");
const errors_1 = require("./errors");
const logger_1 = __importDefault(require("./utils/logger"));
const envSchema = zod_1.z.object({
    MYSQL_HOST: zod_1.z.string(),
    MYSQL_PORT: zod_1.z.string().transform(Number),
    MYSQL_USER: zod_1.z.string(),
    MYSQL_PASSWORD: zod_1.z.string(),
    MYSQL_DATABASE: zod_1.z.string(),
});
/**
 * @internal
 * This class implements the QueryRunner interface for a transaction.
 * It ensures all operations are piped through a single database connection.
 */
class Transaction {
    constructor(client, conn) {
        this.client = client;
        this.conn = conn;
        // Safe methods
        this.selectSingle = (query, params, schema) => this.client.selectSingle(query, params, schema, this.conn);
        this.selectSingleOrDefault = (query, params, schema) => this.client.selectSingleOrDefault(query, params, schema, this.conn);
        this.selectMany = (query, params, schema) => this.client.selectMany(query, params, schema, this.conn);
        // CRUD/Modify
        this.modify = (query, params) => this.client.modify(query, params, this.conn);
        this.insert = (table, data) => this.client.insert(table, data, this.conn);
        this.update = (table, data, where) => this.client.update(table, data, where, this.conn);
        this.delete = (table, where) => this.client.delete(table, where, this.conn);
        // Unsafe methods
        this.selectSingleUnsafe = (query, params) => this.client.selectSingleUnsafe(query, params, this.conn);
        this.selectSingleOrDefaultUnsafe = (query, params) => this.client.selectSingleOrDefaultUnsafe(query, params, this.conn);
        this.selectManyUnsafe = (query, params) => this.client.selectManyUnsafe(query, params, this.conn);
    }
}
/**
 * A modern, type-safe MySQL client for Node.js, featuring runtime validation
 * with Zod, a fluent API, and robust transaction management.
 */
class DatabaseClient {
    /**
     * Creates a new instance of the DatabaseClient.
     * @param options Configuration options for the client.
     */
    constructor(options = {}) {
        this.log = (entry, logFn = logger_1.default.info) => {
            if (this.verbose)
                logFn(entry);
        };
        const { config, useEnv = true, verbose = false } = options;
        this.verbose = verbose;
        this.log({ message: "Initializing DatabaseClient..." });
        try {
            if (config) {
                this.log({ message: "Using provided configuration object." });
                this.pool = promise_1.default.createPool(config);
            }
            else if (useEnv) {
                this.log({
                    message: "Loading configuration from environment variables.",
                });
                const env = envSchema.parse(process.env);
                this.pool = promise_1.default.createPool({
                    ...env,
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0,
                });
            }
            else {
                throw new errors_1.DatabaseError("No database configuration provided. Either pass a config object or set useEnv to true.");
            }
        }
        catch (error) {
            const errorMessage = "Failed to initialize database pool.";
            this.log({ title: "[DB ERROR]", message: errorMessage }, logger_1.default.error);
            throw new errors_1.DatabaseError(errorMessage, error);
        }
    }
    async _executeQuery(executor, query, params) {
        if (!this.verbose) {
            return executor.query(query, params);
        }
        const startTime = performance.now();
        this.log({
            title: "[DB QUERY]",
            message: promise_1.default.format(query, Array.isArray(params) ? params : [params]),
        });
        try {
            const result = await executor.query(query, params);
            const duration = (performance.now() - startTime).toFixed(2);
            const [rows] = result;
            const affectedRows = Array.isArray(rows)
                ? rows.length
                : rows.affectedRows ?? 0;
            this.log({
                title: "[DB SUCCESS]",
                message: `(${affectedRows} rows, ${duration}ms)`,
            }, logger_1.default.success);
            return result;
        }
        catch (error) {
            const duration = (performance.now() - startTime).toFixed(2);
            this.log({
                title: "[DB ERROR]",
                message: `Query failed after ${duration}ms. Details: ${error.message}`,
            }, logger_1.default.error);
            throw error;
        }
    }
    async selectSingle(query, params, schema, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows) || rows.length === 0)
            throw new errors_1.NotFoundError();
        const result = schema.safeParse(rows[0]);
        if (!result.success)
            throw new errors_1.ValidationError("Failed to validate single record", result.error);
        return result.data;
    }
    async selectSingleOrDefault(query, params, schema, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows) || rows.length === 0)
            return null;
        const result = schema.safeParse(rows[0]);
        if (!result.success)
            throw new errors_1.ValidationError("Failed to validate single record", result.error);
        return result.data;
    }
    async selectMany(query, params, schema, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows))
            throw new errors_1.DatabaseError("Query did not return an array of rows.");
        const result = zod_1.z.array(schema).safeParse(rows);
        if (!result.success)
            throw new errors_1.ValidationError("Failed to validate one or more records", result.error);
        return result.data;
    }
    async modify(query, params, connection) {
        const [result] = await this._executeQuery(connection ?? this.pool, query, params);
        return result;
    }
    async insert(table, data, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(data).length === 0)
            throw new errors_1.DatabaseError("Insert data cannot be empty.");
        const query = `INSERT INTO ?? SET ?`;
        return this.modify(query, [table, data], connection);
    }
    async update(table, data, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(data).length === 0)
            throw new errors_1.DatabaseError("Update data cannot be empty.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Update 'where' clause cannot be empty to prevent accidental full-table updates.");
        const query = `UPDATE ?? SET ? WHERE ?`;
        return this.modify(query, [table, data, where], connection);
    }
    async delete(table, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Delete 'where' clause cannot be empty to prevent accidental full-table deletes.");
        const query = `DELETE FROM ?? WHERE ?`;
        return this.modify(query, [table, where], connection);
    }
    async selectSingleUnsafe(query, params, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows) || rows.length === 0)
            throw new errors_1.NotFoundError("Record not found (unsafe search).");
        return rows[0];
    }
    async selectSingleOrDefaultUnsafe(query, params, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows) || rows.length === 0)
            return null;
        return rows[0];
    }
    async selectManyUnsafe(query, params, connection) {
        const [rows] = await this._executeQuery(connection ?? this.pool, query, params);
        if (!Array.isArray(rows))
            throw new errors_1.DatabaseError("Query did not return an array of rows (unsafe search).");
        return rows;
    }
    /**
     * Executes a series of database operations within a transaction.
     * If the callback function resolves, the transaction is committed.
     * If it throws an error, the transaction is automatically rolled back.
     * The connection is always released back to the pool.
     * @param callback An async function that receives a transactional `QueryRunner` instance.
     * @returns A promise that resolves with the return value of the callback.
     */
    async executeTransaction(callback) {
        const connection = await this.pool.getConnection();
        this.log({ message: "Transaction started." });
        await connection.beginTransaction();
        const trx = new Transaction(this, connection);
        try {
            const result = await callback(trx);
            await connection.commit();
            this.log({ message: "Transaction committed successfully." }, logger_1.default.success);
            return result;
        }
        catch (error) {
            await connection.rollback();
            this.log({ message: "Transaction rolled back due to an error." }, logger_1.default.error);
            throw error;
        }
        finally {
            connection.release();
        }
    }
    /**
     * Gracefully closes the database connection pool.
     */
    async close() {
        this.log({ message: "Closing database connection pool." });
        await this.pool.end();
    }
}
exports.DatabaseClient = DatabaseClient;
/**
 * Factory function for creating a `DatabaseClient` instance configured from environment variables.
 * @param options Configuration options, excluding `config` and `useEnv`.
 */
const createDatabaseClient = (options = {}) => {
    return new DatabaseClient({ ...options, useEnv: true });
};
exports.createDatabaseClient = createDatabaseClient;
//# sourceMappingURL=client.js.map
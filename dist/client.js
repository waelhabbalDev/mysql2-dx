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
    MYSQL_PORT: zod_1.z.coerce
        .number()
        .positive()
        .min(0, "Port number must be greater than or equal to 0.")
        .max(65535, "Port number must be less than or equal to 65535."),
    MYSQL_USER: zod_1.z.string(),
    MYSQL_PASSWORD: zod_1.z.string(),
    MYSQL_DATABASE: zod_1.z.string(),
});
/** @internal */
class Transaction {
    constructor(client, conn) {
        this.client = client;
        this.conn = conn;
        this.selectSingle = (q, p, s) => this.client.selectSingle(q, p, s, this.conn);
        this.selectSingleOrDefault = (q, p, s) => this.client.selectSingleOrDefault(q, p, s, this.conn);
        this.selectMany = (q, p, s) => this.client.selectMany(q, p, s, this.conn);
        this.modify = (q, p) => this.client.modify(q, p, this.conn);
        this.insert = (t, d) => this.client.insert(t, d, this.conn);
        this.update = (t, d, w) => this.client.update(t, d, w, this.conn);
        this.delete = (t, w) => this.client.delete(t, w, this.conn);
        this.selectSingleUnsafe = (q, p) => this.client.selectSingleUnsafe(q, p, this.conn);
        this.selectSingleOrDefaultUnsafe = (q, p) => this.client.selectSingleOrDefaultUnsafe(q, p, this.conn);
        this.selectManyUnsafe = (q, p) => this.client.selectManyUnsafe(q, p, this.conn);
        this.executeBatchUnsafe = (queries) => this.client.executeBatchUnsafe(queries, this.conn);
        this.executeBatch = (queries, schemas) => this.client.executeBatch(queries, schemas, this.conn);
    }
}
class DatabaseClient {
    constructor(options = {}) {
        this.log = (entry) => {
            if (this.verbose) {
                logger_1.default.log(entry);
            }
        };
        const { config, verbose = false } = options;
        this.verbose = verbose;
        this.log({ type: "info", message: "Initializing DatabaseClient..." });
        try {
            if (config) {
                this.log({
                    type: "info",
                    message: "Using provided configuration object.",
                });
                this.pool = promise_1.default.createPool({ ...config, multipleStatements: true });
            }
            else {
                this.log({
                    type: "info",
                    message: "Loading configuration from environment variables.",
                });
                const env = envSchema.parse(process.env);
                this.pool = promise_1.default.createPool({
                    host: env.MYSQL_HOST,
                    port: env.MYSQL_PORT,
                    user: env.MYSQL_USER,
                    password: env.MYSQL_PASSWORD,
                    database: env.MYSQL_DATABASE,
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0,
                    multipleStatements: true,
                });
            }
        }
        catch (error) {
            const errorMessage = "Failed to initialize database pool.";
            this.log({
                type: "error",
                message: `${errorMessage} Details: ${error.message}`,
            });
            throw new errors_1.DatabaseError(errorMessage, error);
        }
    }
    async _executeQuery(executor, query, params) {
        if (!this.verbose) {
            return executor.query(query, params);
        }
        const startTime = performance.now();
        const isBatch = query.includes(";") && Array.isArray(params) && params.length === 0;
        const formattedQuery = isBatch
            ? `\n${query
                .split(";")
                .map((q) => `  -> ${q.trim()}`)
                .join("\n")}`
            : promise_1.default.format(query, Array.isArray(params) ? params : [params]);
        this.log({ type: isBatch ? "batch" : "query", message: formattedQuery });
        try {
            const result = await executor.query(query, params);
            const duration = (performance.now() - startTime).toFixed(2);
            const [rows] = result;
            const affectedRows = Array.isArray(rows)
                ? rows.length
                : rows.affectedRows ?? 0;
            this.log({
                type: "success",
                message: `(${affectedRows} total rows/results, ${duration}ms)`,
            });
            return result;
        }
        catch (error) {
            const duration = (performance.now() - startTime).toFixed(2);
            this.log({
                type: "error",
                message: `Query failed after ${duration}ms. Details: ${error.message}`,
            });
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
        return this.modify(`INSERT INTO ?? SET ?`, [table, data], connection);
    }
    async update(table, data, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(data).length === 0)
            throw new errors_1.DatabaseError("Update data cannot be empty.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Update 'where' clause cannot be empty.");
        return this.modify(`UPDATE ?? SET ? WHERE ?`, [table, data, where], connection);
    }
    async delete(table, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Delete 'where' clause cannot be empty.");
        return this.modify(`DELETE FROM ?? WHERE ?`, [table, where], connection);
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
    async executeTransaction(callback) {
        const connection = await this.pool.getConnection();
        this.log({ type: "info", message: "Transaction started." });
        await connection.beginTransaction();
        const trx = new Transaction(this, connection);
        try {
            const result = await callback(trx);
            await connection.commit();
            this.log({
                type: "error",
                message: "Transaction committed successfully.",
            });
            return result;
        }
        catch (error) {
            await connection.rollback();
            this.log({
                type: "error",
                message: "Transaction rolled back due to an error.",
            });
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async close() {
        this.log({ type: "info", message: "Closing database connection pool." });
        await this.pool.end();
    }
    async executeBatchUnsafe(queries, connection) {
        if (queries.length === 0)
            return [];
        const formattedSql = queries
            .map((q) => promise_1.default.format(q.sql, q.params || []))
            .join("; ");
        const [results] = await this._executeQuery(connection ?? this.pool, formattedSql, []);
        return results;
    }
    async executeBatch(queries, schemas, connection) {
        if (queries.length !== schemas.length) {
            throw new errors_1.DatabaseError(`Batch query failed: The number of queries (${queries.length}) must match the number of schemas (${schemas.length}).`);
        }
        const rawResults = await this.executeBatchUnsafe(queries, connection);
        const validatedResults = rawResults.map((result, index) => {
            const schema = schemas[index];
            const parsed = schema.safeParse(result);
            if (!parsed.success) {
                throw new errors_1.ValidationError(`Validation failed for query #${index + 1} ('${queries[index].sql.substring(0, 50)}...')`, parsed.error);
            }
            return parsed.data;
        });
        return validatedResults;
    }
}
exports.DatabaseClient = DatabaseClient;
DatabaseClient.MODIFY_SCHEMA = zod_1.z.custom((val) => typeof val === "object" && val !== null && "affectedRows" in val, "Expected a ResultSetHeader for a modify operation.");
const createDatabaseClient = (options = {}) => new DatabaseClient({ ...options });
exports.createDatabaseClient = createDatabaseClient;
//# sourceMappingURL=client.js.map
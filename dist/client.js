"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabaseClient = exports.DatabaseClient = exports.sql = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const zod_1 = require("zod");
const errors_1 = require("./errors");
const logger_1 = __importDefault(require("./utils/logger"));
/**
 * @deprecated ⚠️ WARNING: Raw SQL expressions bypass all parameterization.
 * Ensure the provided string is completely safe from SQL injection.
 * Prefer using parameterized values instead.
 */
const sql = (expression) => ({
    _isRawSql: true,
    value: expression,
});
exports.sql = sql;
const operatorMap = {
    equals: "=",
    not: "!=",
    in: "IN",
    notIn: "NOT IN",
    lt: "<",
    lte: "<=",
    gt: ">",
    gte: ">=",
    contains: "LIKE",
    startsWith: "LIKE",
    endsWith: "LIKE",
};
function isRawSql(value) {
    return (typeof value === "object" && value !== null && value._isRawSql === true);
}
function isParameterizedQuery(op) {
    return "sql" in op;
}
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
        this.insertMany = (t, d) => this.client.insertMany(t, d, this.conn);
        this.update = (t, d, w) => this.client.update(t, d, w, this.conn);
        this.delete = (t, w) => this.client.delete(t, w, this.conn);
        this.selectSingleUnsafe = (q, p) => this.client.selectSingleUnsafe(q, p, this.conn);
        this.selectSingleOrDefaultUnsafe = (q, p) => this.client.selectSingleOrDefaultUnsafe(q, p, this.conn);
        this.selectManyUnsafe = (q, p) => this.client.selectManyUnsafe(q, p, this.conn);
        this.executeBatchUnsafe = (ops) => this.client.executeBatchUnsafe(ops, this.conn);
        this.executeBatch = (ops, s) => this.client.executeBatch(ops, s, this.conn);
        this.executeTransaction = (callback) => {
            return callback(this);
        };
        this.close = () => {
            return Promise.resolve();
        };
    }
}
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
class DatabaseClient {
    constructor(options) {
        this.log = (entry) => {
            if (this.verbose) {
                logger_1.default.log(entry);
            }
        };
        const { config, verbose = false } = options;
        this.verbose = verbose;
        this.log({ type: "info", message: "Initializing DatabaseClient..." });
        try {
            this.pool = promise_1.default.createPool(config);
            this.log({
                type: "info",
                message: "Database connection pool created successfully.",
            });
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
    _buildSetClause(data) {
        const setClauses = [];
        const params = [];
        for (const key of Object.keys(data)) {
            const value = data[key];
            if (isRawSql(value)) {
                setClauses.push(`?? = ${value.value}`);
                params.push(key);
            }
            else {
                setClauses.push("?? = ?");
                params.push(key, value);
            }
        }
        if (setClauses.length === 0) {
            throw new errors_1.DatabaseError("Update data cannot be empty.");
        }
        return { sql: setClauses.join(", "), params };
    }
    _buildWhereClause(where) {
        const conditions = [];
        const params = [];
        for (const key of Object.keys(where)) {
            const value = where[key];
            if (key === "OR" || key === "AND") {
                const clauses = value
                    .map((condition) => {
                    const sub = this._buildWhereClause(condition);
                    params.push(...sub.params);
                    return `(${sub.sql})`;
                })
                    .join(` ${key} `);
                conditions.push(`(${clauses})`);
            }
            else if (key === "NOT") {
                const sub = this._buildWhereClause(value);
                params.push(...sub.params);
                conditions.push(`NOT (${sub.sql})`);
            }
            else {
                if (typeof value === "object" &&
                    value !== null &&
                    !Array.isArray(value)) {
                    for (const op of Object.keys(value)) {
                        const opValue = value[op];
                        const sqlOp = operatorMap[op];
                        if (!sqlOp)
                            throw new errors_1.DatabaseError(`Unsupported operator: ${op}`);
                        if ((op === "in" || op === "notIn") &&
                            Array.isArray(opValue) &&
                            opValue.length === 0) {
                            if (op === "in") {
                                conditions.push("1=0");
                            }
                            else {
                                conditions.push("1=1");
                            }
                            continue;
                        }
                        if (op === "in" || op === "notIn") {
                            conditions.push(`?? ${sqlOp} (?)`);
                        }
                        else {
                            conditions.push(`?? ${sqlOp} ?`);
                        }
                        params.push(key);
                        if (op === "contains")
                            params.push(`%${opValue}%`);
                        else if (op === "startsWith")
                            params.push(`${opValue}%`);
                        else if (op === "endsWith")
                            params.push(`%${opValue}`);
                        else
                            params.push(opValue);
                    }
                }
                else {
                    conditions.push("?? = ?");
                    params.push(key, value);
                }
            }
        }
        if (conditions.length === 0)
            return { sql: "1=1", params: [] };
        return { sql: conditions.join(" AND "), params };
    }
    async _executeQuery(executor, query, params) {
        const shouldLog = this.verbose && process.env.NODE_ENV !== "production";
        if (!shouldLog) {
            return executor.query(query, params);
        }
        const startTime = performance.now();
        const formattedQuery = promise_1.default.format(query, Array.isArray(params) ? params : [params]);
        this.log({ type: "query", message: formattedQuery });
        try {
            const result = await executor.query(query, params);
            const duration = (performance.now() - startTime).toFixed(2);
            const [rows] = result;
            let successMessage;
            if (Array.isArray(rows)) {
                const rowCount = rows.length;
                successMessage = `(${rowCount} ${rowCount === 1 ? "row" : "rows"} returned, ${duration}ms)`;
            }
            else {
                const affectedRows = rows.affectedRows ?? 0;
                successMessage = `(${affectedRows} ${affectedRows === 1 ? "row" : "rows"} affected, ${duration}ms)`;
            }
            this.log({ type: "success", message: successMessage });
            return result;
        }
        catch (error) {
            const duration = (performance.now() - startTime).toFixed(2);
            this.log({
                type: "error",
                message: `Query failed after ${duration}ms. Details: ${error.message}`,
            });
            throw new errors_1.DatabaseError(`Query failed: ${error.message}`, error);
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
        if (!/^[a-zA-Z0-9_]+$/.test(table)) {
            throw new errors_1.DatabaseError("Invalid table name.");
        }
        if (Object.keys(data).length === 0) {
            throw new errors_1.DatabaseError("Insert data cannot be empty.");
        }
        const columns = [];
        const valuePlaceholders = [];
        const values = [];
        for (const key of Object.keys(data)) {
            columns.push(key);
            const value = data[key];
            if (isRawSql(value)) {
                valuePlaceholders.push(value.value);
            }
            else {
                valuePlaceholders.push("?");
                values.push(value);
            }
        }
        const sql = `INSERT INTO ?? (??) VALUES (${valuePlaceholders.join(", ")});`;
        const params = [table, columns, ...values];
        return this.modify(sql, params, connection);
    }
    async insertMany(table, data, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (!Array.isArray(data) || data.length === 0)
            throw new errors_1.DatabaseError("Insert data must be a non-empty array.");
        const columns = Object.keys(data[0]);
        if (columns.length === 0)
            throw new errors_1.DatabaseError("Data objects for insertMany cannot be empty.");
        const hasRawSql = data.some((row) => Object.values(row).some((val) => isRawSql(val)));
        if (!hasRawSql) {
            this.log({
                type: "info",
                message: "Using optimized path for insertMany (no raw SQL).",
            });
            const values = data.map((row) => columns.map((col) => {
                if (!(col in row)) {
                    throw new errors_1.DatabaseError(`Inconsistent shape in insertMany data: object is missing key '${col}'.`);
                }
                return row[col];
            }));
            const sql = `INSERT INTO ?? (??) VALUES ?`;
            return this.modify(sql, [table, columns, values], connection);
        }
        this.log({
            type: "info",
            message: "Using manual query builder for insertMany due to raw SQL.",
        });
        const valuePlaceholders = [];
        const params = [];
        for (const row of data) {
            const rowValuePlaceholders = [];
            for (const col of columns) {
                if (!(col in row)) {
                    throw new errors_1.DatabaseError(`Inconsistent shape in insertMany data: object is missing key '${col}'.`);
                }
                const value = row[col];
                if (isRawSql(value)) {
                    rowValuePlaceholders.push(value.value);
                }
                else {
                    rowValuePlaceholders.push("?");
                    params.push(value);
                }
            }
            valuePlaceholders.push(`(${rowValuePlaceholders.join(", ")})`);
        }
        const sql = `INSERT INTO ?? (??) VALUES ${valuePlaceholders.join(", ")}`;
        return this.modify(sql, [table, columns, ...params], connection);
    }
    async update(table, data, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(data).length === 0)
            throw new errors_1.DatabaseError("Update data cannot be empty.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Update 'where' clause cannot be empty. For safety, use a condition like `{ id: { gt: 0 } }` to update all rows.");
        const { sql: setSql, params: setParams } = this._buildSetClause(data);
        const { sql: whereSql, params: whereParams } = this._buildWhereClause(where);
        const sql = `UPDATE ?? SET ${setSql} WHERE ${whereSql}`;
        const params = [table, ...setParams, ...whereParams];
        return this.modify(sql, params, connection);
    }
    async delete(table, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Delete 'where' clause cannot be empty. For safety, use a condition like `{ id: { gt: 0 } }` to delete all rows.");
        const { sql: whereSql, params: whereParams } = this._buildWhereClause(where);
        const sql = `DELETE FROM ?? WHERE ${whereSql}`;
        const params = [table, ...whereParams];
        return this.modify(sql, params, connection);
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
                type: "success",
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
    async executeBatchUnsafe(operations, connection) {
        if (operations.length === 0)
            return [];
        const executor = connection ?? (await this.pool.getConnection());
        const isManagingTransaction = !connection;
        if (isManagingTransaction)
            await executor.beginTransaction();
        try {
            const results = [];
            for (const op of operations) {
                let sql;
                let params;
                if (isParameterizedQuery(op)) {
                    sql = op.sql;
                    params = op.params || [];
                }
                else {
                    switch (op.op) {
                        case "insert": {
                            if (Array.isArray(op.data)) {
                                const columns = Object.keys(op.data[0]);
                                const values = op.data.map((row) => columns.map((col) => row[col]));
                                sql = `INSERT INTO ?? (??) VALUES ?`;
                                params = [op.table, columns, values];
                            }
                            else {
                                sql = `INSERT INTO ?? SET ?`;
                                params = [op.table, op.data];
                            }
                            break;
                        }
                        case "update": {
                            const { sql: whereSql, params: whereParams } = this._buildWhereClause(op.where);
                            sql = `UPDATE ?? SET ? WHERE ${whereSql}`;
                            params = [op.table, op.data, ...whereParams];
                            break;
                        }
                        case "delete": {
                            const { sql: whereSql, params: whereParams } = this._buildWhereClause(op.where);
                            sql = `DELETE FROM ?? WHERE ${whereSql}`;
                            params = [op.table, ...whereParams];
                            break;
                        }
                    }
                }
                const [result] = await this._executeQuery(executor, sql, params);
                results.push(result);
            }
            if (isManagingTransaction)
                await executor.commit();
            return results;
        }
        catch (error) {
            if (isManagingTransaction)
                await executor.rollback();
            throw error;
        }
        finally {
            if (isManagingTransaction)
                executor.release();
        }
    }
    async executeBatch(operations, schemas, connection) {
        if (operations.length !== schemas.length) {
            throw new errors_1.DatabaseError(`Batch query failed: The number of operations (${operations.length}) must match the number of schemas (${schemas.length}).`);
        }
        const rawResults = await this.executeBatchUnsafe(operations, connection);
        const validatedResults = rawResults.map((result, index) => {
            const schema = schemas[index];
            const parsed = schema.safeParse(result);
            if (!parsed.success) {
                const op = operations[index];
                const opIdentifier = isParameterizedQuery(op)
                    ? op.sql.substring(0, 50)
                    : `${op.op} on ${op.table}`;
                throw new errors_1.ValidationError(`Validation failed for operation #${index + 1} ('${opIdentifier}...')`, parsed.error);
            }
            return parsed.data;
        });
        return validatedResults;
    }
    async close() {
        this.log({ type: "info", message: "Closing database connection pool." });
        await this.pool.end();
    }
}
exports.DatabaseClient = DatabaseClient;
DatabaseClient.MODIFY_SCHEMA = zod_1.z.custom((val) => typeof val === "object" && val !== null && "affectedRows" in val, "Expected a ResultSetHeader for a modify operation.");
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
const createDatabaseClient = (options) => new DatabaseClient(options);
exports.createDatabaseClient = createDatabaseClient;
//# sourceMappingURL=client.js.map
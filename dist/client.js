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
// Helper function to check if an operation is a raw query
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
            // Transactions cannot be nested. The callback simply executes on the existing transaction connection.
            return callback(this);
        };
        this.close = () => {
            // `close` is a no-op inside a transaction; the parent client manages the pool.
            return Promise.resolve();
        };
    }
}
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
                        // *** START OF FIX ***
                        if (op === "in" || op === "notIn") {
                            conditions.push(`?? ${sqlOp} (?)`); // Note the extra parentheses around the placeholder
                        }
                        else {
                            conditions.push(`?? ${sqlOp} ?`);
                        }
                        // *** END OF FIX ***
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
        if (!this.verbose)
            return executor.query(query, params);
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
    async insertMany(table, data, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (!Array.isArray(data) || data.length === 0)
            throw new errors_1.DatabaseError("Insert data must be a non-empty array.");
        const columns = Object.keys(data[0]);
        if (columns.length === 0)
            throw new errors_1.DatabaseError("Data objects for insertMany cannot be empty.");
        const values = data.map((row) => columns.map((col) => row[col]));
        const sql = `INSERT INTO ?? (??) VALUES ?`;
        return this.modify(sql, [table, columns, values], connection);
    }
    async update(table, data, where, connection) {
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new errors_1.DatabaseError("Invalid table name.");
        if (Object.keys(data).length === 0)
            throw new errors_1.DatabaseError("Update data cannot be empty.");
        if (Object.keys(where).length === 0)
            throw new errors_1.DatabaseError("Update 'where' clause cannot be empty. For safety, use a condition like `{ id: { gt: 0 } }` to update all rows.");
        const { sql: whereSql, params: whereParams } = this._buildWhereClause(where);
        const sql = `UPDATE ?? SET ? WHERE ${whereSql}`;
        const params = [table, data, ...whereParams];
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
 * @param options - The configuration options, including the mandatory `config` object.
 * @returns A new DatabaseClient instance.
 */
const createDatabaseClient = (options) => new DatabaseClient(options);
exports.createDatabaseClient = createDatabaseClient;
//# sourceMappingURL=client.js.map
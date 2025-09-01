"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.NotFoundError = exports.DatabaseError = void 0;
/**
 * Base error class for all database-related errors.
 */
class DatabaseError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "DatabaseError";
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Thrown when a query expecting a single result finds no records.
 */
class NotFoundError extends DatabaseError {
    constructor(message = "Record not found") {
        super(message);
        this.name = "NotFoundError";
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Thrown when database results fail to parse against the provided Zod schema.
 */
class ValidationError extends DatabaseError {
    constructor(message, cause) {
        super(message, cause);
        this.cause = cause;
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
//# sourceMappingURL=errors.js.map
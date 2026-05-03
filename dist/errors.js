"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.NotFoundError = exports.DatabaseError = void 0;
/**
 * Base error class for all database‑related errors thrown by this library.
 *
 * All other specific errors (`NotFoundError`, `ValidationError`) extend this class.
 *
 * @example
 * try {
 *   await db.selectSingle(...);
 * } catch (err) {
 *   if (err instanceof DatabaseError) {
 *     console.error('Database operation failed:', err.message);
 *   }
 * }
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
 * Thrown when a `selectSingle` or `selectSingleUnsafe` query finds no matching record.
 *
 * Inherits from `DatabaseError`.
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
 *
 * The `.cause` property contains the detailed Zod error.
 * Inherits from `DatabaseError`.
 *
 * @example
 * try {
 *   await db.selectMany('SELECT * FROM users', [], userSchema);
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.error('Schema mismatch:', err.cause);
 *   }
 * }
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
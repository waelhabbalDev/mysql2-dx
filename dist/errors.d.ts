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
export declare class DatabaseError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Thrown when a `selectSingle` or `selectSingleUnsafe` query finds no matching record.
 *
 * Inherits from `DatabaseError`.
 */
export declare class NotFoundError extends DatabaseError {
    constructor(message?: string);
}
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
export declare class ValidationError extends DatabaseError {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}

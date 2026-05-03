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
export class DatabaseError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * Thrown when a `selectSingle` or `selectSingleUnsafe` query finds no matching record.
 *
 * Inherits from `DatabaseError`.
 */
export class NotFoundError extends DatabaseError {
  constructor(message: string = "Record not found") {
    super(message);
    this.name = "NotFoundError";
  }
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
export class ValidationError extends DatabaseError {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message, cause);
    this.name = "ValidationError";
  }
}

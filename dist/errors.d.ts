/**
 * Base error class for all database-related errors.
 */
export declare class DatabaseError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Thrown when a query expecting a single result finds no records.
 */
export declare class NotFoundError extends DatabaseError {
    constructor(message?: string);
}
/**
 * Thrown when database results fail to parse against the provided Zod schema.
 */
export declare class ValidationError extends DatabaseError {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}

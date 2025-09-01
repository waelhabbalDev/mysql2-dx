/**
 * =================================================================
 * |                    mysql2-dx Public API                       |
 * =================================================================
 *
 * This file is the main entry point for the mysql2-dx package.
 * It re-exports all the public-facing classes, functions, types,
 * and errors that users of this library will interact with.
 *
 * Anything not exported from this file is considered an internal
 * implementation detail and should not be relied upon.
 */
export { DatabaseClient, createDatabaseClient } from "./client";
export type { DatabaseClientOptions, MySQLPrimitive, QueryParameters, QueryRunner, } from "./types";
export { DatabaseError, NotFoundError, ValidationError } from "./errors";

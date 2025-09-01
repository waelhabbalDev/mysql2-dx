"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.NotFoundError = exports.DatabaseError = exports.createDatabaseClient = exports.DatabaseClient = void 0;
// --- Core Functionality ---
// These are the main exports users will interact with to create and use the client.
var client_1 = require("./client");
Object.defineProperty(exports, "DatabaseClient", { enumerable: true, get: function () { return client_1.DatabaseClient; } });
Object.defineProperty(exports, "createDatabaseClient", { enumerable: true, get: function () { return client_1.createDatabaseClient; } });
// --- Custom Error Classes ---
// Exporting the custom errors allows users to write robust error handling
// logic, such as `try...catch` blocks that can check for specific error types.
var errors_1 = require("./errors");
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_1.DatabaseError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return errors_1.NotFoundError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
//# sourceMappingURL=index.js.map
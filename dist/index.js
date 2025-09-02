"use strict";
/**
 * =================================================================
 * |                    mysql2-dx Public API                       |
 * =================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.NotFoundError = exports.DatabaseError = exports.createDatabaseClient = exports.DatabaseClient = void 0;
// --- Core Functionality ---
var client_1 = require("./client");
Object.defineProperty(exports, "DatabaseClient", { enumerable: true, get: function () { return client_1.DatabaseClient; } });
Object.defineProperty(exports, "createDatabaseClient", { enumerable: true, get: function () { return client_1.createDatabaseClient; } });
// --- Custom Error Classes ---
var errors_1 = require("./errors");
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_1.DatabaseError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return errors_1.NotFoundError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
//# sourceMappingURL=index.js.map
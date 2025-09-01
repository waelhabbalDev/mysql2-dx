# MySQL-DX

[![NPM Version](https://img.shields.io/npm/v/@waelhabbaldev/mysql2-dx.svg)](https://www.npmjs.com/package/@waelhabbaldev/mysql2-dx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A lightweight, type-safe MySQL client for Node.js. Adds robust Zod schema validation, a fluent API, and simple transaction management to `mysql2/promise`.**

`mysql2-dx` is designed to bridge the gap between using raw `mysql2` and a heavy, full-featured ORM. It provides essential quality-of-life features like runtime validation and ergonomic helpers without sacrificing performance or forcing you into complex abstractions.

## Key Features

- ✅ **Type-Safe by Default:** Leverage the power of Zod to validate database results at runtime, eliminating an entire class of bugs.
- 🔥 **High-Performance "Unsafe" Mode:** Bypass Zod validation with `...Unsafe` methods for performance-critical queries where speed is paramount.
- 🗂️ **Robust Transactions:** A simple, promise-based `executeTransaction` API with automatic commit and rollback.
- 🔧 **Ergonomic CRUD Helpers:** Clean, simple methods for `insert`, `update`, and `delete` operations.
- ⚙️ **Built on `mysql2/promise`:** Uses the fast, popular, and reliable `mysql2` driver with connection pooling for efficient database communication.
- 🌐 **Flexible Configuration:** Configure via environment variables (`.env`) or a direct config object.

## Installation

```bash

npm install @waelhabbaldev/mysql2-dx mysql2 zod

```

# Quick Start

```javascript
import { z } from "zod";
import { createDatabaseClient } from "@waelhabbaldev/mysql2-dx";

// 1. Define your data schema
const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// 2. Create a client (it will load from .env variables)
const db = createDatabaseClient({ verbose: true });

async function main() {
  // 3. Run a safe, validated query
  try {
    const user = await db.selectSingle(
      "SELECT * FROM users WHERE id = ?",
      [1],
      userSchema
    );
    console.log("Safe query result:", user.name); // Type-safe!
  } catch (error) {
    console.error("Could not find user or validation failed:", error);
  }

  // 4. Run a transaction
  await db.executeTransaction(async (trx) => {
    await trx.update("users", { name: "New Name" }, { id: 1 });
    await trx.insert("audit_logs", { action: "User name updated", userId: 1 });
  });
  console.log("Transaction complete!");

  await db.close();
}

main();
```

# API Reference

The DatabaseClient instance provides the following core methods. All select methods have a corresponding ...Unsafe version.

- selectSingle(query, params, schema)
- selectSingleOrDefault(query, params, schema)
- selectMany(query, params, schema)
- modify(query, params)
- insert(table, data)
- update(table, data, where)
- delete(table, where)
- executeTransaction(callback)
- close()

# License

This project is licensed under the MIT License.

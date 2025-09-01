# MySQL-DX (Developer Experience)

A modern, type-safe MySQL client for Node.js with first-class Zod integration for runtime validation, a fluent API, and robust transaction management.

## Features

- ✅ **Type-Safe by Default:** Queries are validated at runtime with Zod schemas.
- 🔥 **High-Performance "Unsafe" Mode:** Bypass validation for performance-critical operations.
- 🗂️ **Robust Transactions:** Simple, promise-based API with automatic commit/rollback.
- 🔧 **Ergonomic API:** Simple methods for `insert`, `update`, and `delete`.
- ⚙️ **Connection Pooling:** Built on `mysql2/promise` for efficient connection management.

## Installation

```bash

npm install @waelhabbaldev/mysql2-dx mysql2 zod

```

# Quick Start

```javascript
import { z } from "zod";
import { createDatabaseClient } from "@your-npm-username/mysql2-dx";

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

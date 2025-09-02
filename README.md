# mysql2-dx v1.0.3

[![NPM Version](https://img.shields.io/npm/v/@waelhabbaldev/mysql2-dx.svg)](https://www.npmjs.com/package/@waelhabbaldev/mysql2-dx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A modern, type-safe MySQL client for Node.js, featuring runtime validation with Zod, robust transactions, and efficient batch querying.**

`mysql2-dx` (Developer Experience) is a lightweight, high-performance wrapper around the excellent `mysql2/promise` library. It's designed to provide a superior developer experience by integrating modern TypeScript features and Zod for runtime validation, eliminating common database-related bugs and boilerplate.

### Key Features

-   **✅ End-to-End Type Safety:** Write your queries and get back fully-typed results, validated at runtime.
-   **⚡️ Efficient Batch Operations:** Execute multiple queries in a single network round trip to dramatically improve performance.
-   **🔒 Zod Integration:** Define your data shapes once with Zod schemas and get automatic validation and type inference.
-   **🔐 Robust Transactions:** A clean, promise-based transaction API that automatically handles commits, rollbacks, and connection releasing.
-   **🚀 Simple & Clean API:** Intuitive methods (`selectSingle`, `insert`, etc.) that are easy to learn and use.
-   **⚙️ Zero-Config Setup:** Automatically configures from standard environment variables.
-   **🐞 Enhanced Debugging:** Optional verbose logging that prints formatted queries, parameters, and timings.

### Installation

```bash
npm install mysql2-dx mysql2 zod
```

### Quick Start

1.  **Set up your environment variables** in a `.env` file:
    ```env
    MYSQL_HOST=127.0.0.1
    MYSQL_PORT=3306
    MYSQL_USER=root
    MYSQL_PASSWORD=your_password
    MYSQL_DATABASE=your_db
    ```

2.  **Create the client and run a query:**
    ```typescript
    import { createDatabaseClient } from "mysql2-dx";
    import { z } from "zod";

    // Create a single, shared client instance
    const dbClient = createDatabaseClient({ verbose: true });

    // Define a Zod schema for your data
    const userSchema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
    });

    async function getUser(userId: string) {
      try {
        const user = await dbClient.selectSingle(
          "SELECT * FROM users WHERE id = ?",
          [userId],
          userSchema
        );

        console.log(`Welcome, ${user.name}!`);
        // user is fully typed as { id: string; name: string; email: string; }
      } catch (error) {
        // Handles NotFoundError, ValidationError, etc.
        console.error("Failed to fetch user:", error);
      }
    }
    ```

### API Reference

#### Fetching Data (Safe Methods)

-   `selectSingle(sql, params, schema)`: Fetches exactly one row. Throws `NotFoundError` if none is found.
-   `selectSingleOrDefault(sql, params, schema)`: Fetches one row or `null`.
-   `selectMany(sql, params, schema)`: Fetches an array of rows. Returns `[]` if none are found.

#### Modifying Data

-   `insert(tableName, dataObject)`: Safely inserts a new row.
-   `update(tableName, dataObject, whereObject)`: Safely updates rows matching the where clause.
-   `delete(tableName, whereObject)`: Safely deletes rows.
-   `modify(sql, params)`: For complex updates, deletes, or DDL statements. Returns a `ResultSetHeader`.

#### Transactions

The `executeTransaction` method guarantees that all operations within the callback are atomic. It automatically handles commits, rollbacks, and connection releasing.

```typescript
async function transferFunds(fromId: string, toId: string, amount: number) {
  return dbClient.executeTransaction(async (trx) => {
    // 'trx' has the same methods as dbClient (selectSingle, update, etc.)
    await trx.modify(
      "UPDATE accounts SET balance = balance - ? WHERE id = ?",
      [amount, fromId]
    );
    await trx.modify(
      "UPDATE accounts SET balance = balance + ? WHERE id = ?",
      [amount, toId]
    );
    return { success: true };
  });
}
```

---

### ✨ New in v1.0.3: Batch Operations

Reduce network latency by sending multiple queries to the database in a single round trip. This is ideal for dashboards or pages that need to fetch several different pieces of data.

`executeBatch` takes an array of queries and a corresponding tuple of Zod schemas, returning a perfectly typed tuple of results.

**Example: Fetch a user's profile and their 5 most recent posts in one trip.**

```typescript
import { DatabaseClient } from "mysql2-dx"; // Import the class for the static property

const [user, posts, updateResult] = await dbClient.executeBatch(
  [
    // Query 1: Get user profile
    { sql: "SELECT * FROM users WHERE id = ?", params: [userId] },
    // Query 2: Get 5 recent posts
    { sql: "SELECT id, title, createdAt FROM posts WHERE authorId = ? LIMIT 5", params: [userId] },
    // Query 3: An update statement
    { sql: "UPDATE users SET lastActive = NOW() WHERE id = ?", params: [userId] }
  ],
  // Schemas must be in the same order as the queries
  [
    userSchema,
    postSchema.pick({ id: true, title: true, createdAt: true }), // Schema for query 2
    DatabaseClient.MODIFY_SCHEMA, // A special schema for INSERT/UPDATE/DELETE
  ]
);

// The return type is a perfectly inferred tuple:
// user: TUser
// posts: TPost[]
// updateResult: ResultSetHeader
```

### Unsafe Methods

For performance-critical situations where you want to skip Zod validation, "unsafe" variants are available. They return raw `RowDataPacket` objects from `mysql2`.

-   `selectSingleUnsafe(sql, params)`
-   `selectSingleOrDefaultUnsafe(sql, params)`
-   `selectManyUnsafe(sql, params)`
-   `executeBatchUnsafe(queries)`

### Error Handling

The client throws distinct error types to allow for precise error handling:
-   `DatabaseError`: A generic database-related error.
-   `NotFoundError`: Thrown by `selectSingle` when no record is found.
-   `ValidationError`: Thrown when data fetched from the DB fails to match your Zod schema.

```typescript
import { NotFoundError, ValidationError } from "mysql2-dx";

try {
  // ... dbClient call
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle 404
  } else if (error instanceof ValidationError) {
    // Data integrity issue, log the validation errors
    console.error(error.cause);
  } else {
    // Handle other errors
  }
}
```

### License

MIT
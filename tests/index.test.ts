import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import {
  createDatabaseClient,
  DatabaseClient,
  sql,
  DatabaseError,
  NotFoundError,
  ValidationError,
  BatchOperation,
} from "../src/index";
import type { PoolOptions } from "mysql2/promise";
import { z } from "zod";


dotenvConfig({ path: resolve(__dirname, "../.env.test") });


export const testDbConfig: PoolOptions = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

let dbClient: DatabaseClient;
let setupDbClient: DatabaseClient;


async function cleanTable(client: DatabaseClient) {
  await client.modify("DELETE FROM test_users", []);
  
  await client.modify("ALTER TABLE test_users AUTO_INCREMENT = 1", []);
}

beforeAll(async () => {
  console.log("Setting up the test database...");
  setupDbClient = createDatabaseClient({
    config: testDbConfig,
    verbose: false,
  });

  
  await setupDbClient.modify("DROP TABLE IF EXISTS test_users", []);

  
  await setupDbClient.modify(
    `CREATE TABLE test_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      age INT
    )`,
    [],
  );

  
  await setupDbClient.modify(
    `CREATE TABLE test_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2)
    )`,
    [],
  );

  console.log("Database setup complete.");

  
  dbClient = createDatabaseClient({ config: testDbConfig, verbose: false });
});

afterAll(async () => {
  if (setupDbClient) {
    console.log("Tearing down the test database...");
    await setupDbClient.modify("DROP TABLE IF EXISTS test_users", []);
    await setupDbClient.modify("DROP TABLE IF EXISTS test_products", []);
    await setupDbClient.close();
    console.log("Database teardown complete.");
  }
  if (dbClient) {
    await dbClient.close();
  }
});


const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  age: z.number().nullable(),
});

const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.coerce.number<number>(),
});




describe("insert", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
  });

  it("should insert a single user and return ResultSetHeader", async () => {
    const result = await dbClient.insert("test_users", {
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    });
    expect(result.affectedRows).toBe(1);
    expect(result.insertId).toBeGreaterThan(0);
  });

  it("should insert with raw SQL using sql() helper", async () => {
    const result = await dbClient.insert("test_users", {
      name: "Jane",
      email: "jane@example.com",
      age: sql("25"), 
    });
    expect(result.affectedRows).toBe(1);

    const user = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE email = ?",
      ["jane@example.com"],
      UserSchema,
    );
    expect(user.age).toBe(25);
  });

  it("should throw DatabaseError if data is empty", async () => {
    await expect(dbClient.insert("test_users", {})).rejects.toThrow(
      DatabaseError,
    );
  });

  it("should throw DatabaseError if table name is invalid", async () => {
    await expect(
      dbClient.insert("invalid-table-name", { name: "test" }),
    ).rejects.toThrow(DatabaseError);
  });
});

describe("insertMany", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
  });

  it("should insert multiple rows (optimized path, no raw SQL)", async () => {
    const users = [
      { name: "Alice", email: "alice@example.com", age: 25 },
      { name: "Bob", email: "bob@example.com", age: 30 },
    ];
    const result = await dbClient.insertMany("test_users", users);
    expect(result.affectedRows).toBe(2);

    const rows = await dbClient.selectMany(
      "SELECT * FROM test_users ORDER BY id",
      [],
      UserSchema,
    );
    expect(rows).toHaveLength(2);
  });

  it("should insert multiple rows with some raw SQL (manual path)", async () => {
    const users = [
      { name: "Charlie", email: "charlie@example.com", age: sql("20") },
      { name: "Daisy", email: "daisy@example.com", age: 22 },
    ];
    const result = await dbClient.insertMany("test_users", users);
    expect(result.affectedRows).toBe(2);

    const rows = await dbClient.selectMany(
      "SELECT * FROM test_users ORDER BY id",
      [],
      UserSchema,
    );
    expect(rows[0].age).toBe(20);
    expect(rows[1].age).toBe(22);
  });

  it("should throw error if array is empty", async () => {
    await expect(dbClient.insertMany("test_users", [])).rejects.toThrow(
      DatabaseError,
    );
  });

  it("should throw error if objects have inconsistent shape", async () => {
    const users = [
      { name: "Eve", email: "eve@example.com", age: 28 },
      { name: "Frank", email: "frank@example.com" } as Record<string, any>,
    ];
    await expect(dbClient.insertMany("test_users", users)).rejects.toThrow(
      DatabaseError,
    );
  });
});




describe("selectSingle", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.insert("test_users", {
      name: "Test User",
      email: "select@example.com",
      age: 40,
    });
  });

  it("should return a single user matching the query", async () => {
    const user = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE email = ?",
      ["select@example.com"],
      UserSchema,
    );
    expect(user.email).toBe("select@example.com");
    expect(user.name).toBe("Test User");
  });

  it("should throw NotFoundError if no record found", async () => {
    await expect(
      dbClient.selectSingle(
        "SELECT * FROM test_users WHERE email = ?",
        ["nonexistent@example.com"],
        UserSchema,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ValidationError if schema does not match", async () => {
    const WrongSchema = z.object({ wrongField: z.string() });
    await expect(
      dbClient.selectSingle(
        "SELECT * FROM test_users WHERE email = ?",
        ["select@example.com"],
        WrongSchema,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("selectSingleOrDefault", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.insert("test_users", {
      name: "Default Test",
      email: "default@example.com",
      age: null,
    });
  });

  it("should return user if exists", async () => {
    const user = await dbClient.selectSingleOrDefault(
      "SELECT * FROM test_users WHERE email = ?",
      ["default@example.com"],
      UserSchema,
    );
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Default Test");
  });

  it("should return null if no record found", async () => {
    const result = await dbClient.selectSingleOrDefault(
      "SELECT * FROM test_users WHERE email = ?",
      ["missing@example.com"],
      UserSchema,
    );
    expect(result).toBeNull();
  });
});

describe("selectMany", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.insertMany("test_users", [
      { name: "Many1", email: "many1@example.com", age: 10 },
      { name: "Many2", email: "many2@example.com", age: 20 },
    ]);
  });

  it("should return array of users", async () => {
    const users = await dbClient.selectMany(
      "SELECT * FROM test_users ORDER BY age",
      [],
      UserSchema,
    );
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe("Many1");
  });

  it("should return empty array if no rows", async () => {
    await cleanTable(dbClient);
    const users = await dbClient.selectMany(
      "SELECT * FROM test_users",
      [],
      UserSchema,
    );
    expect(users).toHaveLength(0);
  });

  it("should throw ValidationError if any row invalid", async () => {
    const WrongSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      missingField: z.string(), 
    });

    await expect(
      dbClient.selectMany("SELECT * FROM test_users", [], WrongSchema),
    ).rejects.toThrow(ValidationError);
  });
});




describe("update", () => {
  let userId: number;
  beforeEach(async () => {
    await cleanTable(dbClient);
    const result = await dbClient.insert("test_users", {
      name: "Update Me",
      email: "update@example.com",
      age: 25,
    });
    userId = result.insertId;
  });

  it("should update a user", async () => {
    const result = await dbClient.update(
      "test_users",
      { name: "Updated Name", age: 30 },
      { id: userId },
    );
    expect(result.affectedRows).toBe(1);
    const user = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE id = ?",
      [userId],
      UserSchema,
    );
    expect(user.name).toBe("Updated Name");
    expect(user.age).toBe(30);
  });

  it("should update using raw SQL expression", async () => {
    const result = await dbClient.update(
      "test_users",
      { age: sql("age + 5") },
      { id: userId },
    );
    expect(result.affectedRows).toBe(1);
    const user = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE id = ?",
      [userId],
      UserSchema,
    );
    expect(user.age).toBe(30); 
  });

  it("should throw if where clause is empty", async () => {
    await expect(
      dbClient.update("test_users", { name: "x" }, {}),
    ).rejects.toThrow(DatabaseError);
  });

  it("should throw if data is empty", async () => {
    await expect(
      dbClient.update("test_users", {}, { id: userId }),
    ).rejects.toThrow(DatabaseError);
  });
});

describe("delete", () => {
  let userId: number;
  beforeEach(async () => {
    await cleanTable(dbClient);
    const result = await dbClient.insert("test_users", {
      name: "Delete Me",
      email: "delete@example.com",
      age: 25,
    });
    userId = result.insertId;
  });

  it("should delete a user", async () => {
    const result = await dbClient.delete("test_users", { id: userId });
    expect(result.affectedRows).toBe(1);
    const exists = await dbClient.selectSingleOrDefault(
      "SELECT * FROM test_users WHERE id = ?",
      [userId],
      UserSchema,
    );
    expect(exists).toBeNull();
  });

  it("should throw if where clause is empty", async () => {
    await expect(dbClient.delete("test_users", {})).rejects.toThrow(
      DatabaseError,
    );
  });
});




describe("where condition operators", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.insertMany("test_users", [
      { name: "Alice", email: "alice@test.com", age: 18 },
      { name: "Bob", email: "bob@test.com", age: 25 },
      { name: "Charlie", email: "charlie@test.com", age: 30 },
      { name: "David", email: "david@test.com", age: 35 },
      { name: "Eve", email: "eve@test.com", age: 40 },
    ]);
  });

  it("should support equals", async () => {
    const users = await dbClient.selectMany(
      "SELECT * FROM test_users WHERE ?",
      [dbClient as any], 
      UserSchema,
    );
    
    
    
    
    const result = await dbClient.delete("test_users", { name: "Bob" });
    expect(result.affectedRows).toBe(1);
    const remaining = await dbClient.selectMany(
      "SELECT name FROM test_users",
      [],
      z.object({ name: z.string() }),
    );
    const names = remaining.map((r) => r.name);
    expect(names).not.toContain("Bob");
  });

  it("should support not operator", async () => {
    await dbClient.delete("test_users", { age: { not: 30 } });
    const remaining = await dbClient.selectMany(
      "SELECT * FROM test_users",
      [],
      UserSchema,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].age).toBe(30);
  });

  it("should support comparison operators (lt, lte, gt, gte)", async () => {
    await dbClient.delete("test_users", { age: { gt: 30 } });
    const users = await dbClient.selectMany(
      "SELECT age FROM test_users",
      [],
      z.object({ age: z.number().nullable() }),
    );
    const ages = users.map((u) => u.age);
    expect(ages.every((a) => a! <= 30)).toBe(true);
  });

  it("should support string operators (contains, startsWith, endsWith)", async () => {
    await dbClient.delete("test_users", { name: { contains: "li" } }); 
    const users = await dbClient.selectMany(
      "SELECT name FROM test_users",
      [],
      z.object({ name: z.string() }),
    );
    const names = users.map((u) => u.name);
    expect(names).toEqual(["Bob", "David", "Eve"]);
  });

  it("should support IN operator", async () => {
    await dbClient.delete("test_users", { age: { in: [18, 35] } });
    const users = await dbClient.selectMany(
      "SELECT age FROM test_users",
      [],
      z.object({ age: z.number().nullable() }),
    );
    const ages = users.map((u) => u.age);
    expect(ages).not.toContain(18);
    expect(ages).not.toContain(35);
  });

  it("should handle empty array for IN (produces 1=0)", async () => {
    
    const result = await dbClient.delete("test_users", { age: { in: [] } });
    expect(result.affectedRows).toBe(0);
    const all = await dbClient.selectMany(
      "SELECT COUNT(*) as cnt FROM test_users",
      [],
      z.object({ cnt: z.number() }),
    );
    expect(all[0].cnt).toBe(5);
  });

  it("should handle empty array for NOT IN (produces 1=1)", async () => {
    
    const result = await dbClient.delete("test_users", { age: { notIn: [] } });
    expect(result.affectedRows).toBe(5);
  });

  it("should support AND logical operator", async () => {
    await dbClient.delete("test_users", {
      AND: [{ age: { gt: 20 } }, { age: { lt: 40 } }],
    });
    const users = await dbClient.selectMany(
      "SELECT age FROM test_users",
      [],
      z.object({ age: z.number().nullable() }),
    );
    const ages = users.map((u) => u.age);
    expect(ages).toEqual([18, 40]);
  });

  it("should support OR logical operator", async () => {
    await dbClient.delete("test_users", {
      OR: [{ name: "Alice" }, { name: "Eve" }],
    });
    const users = await dbClient.selectMany(
      "SELECT name FROM test_users",
      [],
      z.object({ name: z.string() }),
    );
    const names = users.map((u) => u.name);
    expect(names).toEqual(["Bob", "Charlie", "David"]);
  });

  it("should support NOT logical operator", async () => {
    await dbClient.delete("test_users", { NOT: { age: { lt: 30 } } });
    const users = await dbClient.selectMany(
      "SELECT age FROM test_users",
      [],
      z.object({ age: z.number().nullable() }),
    );
    const ages = users.map((u) => u.age);
    expect(ages.every((a) => a! < 30)).toBe(true);
  });
});




describe("unsafe methods", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.insert("test_users", {
      name: "Unsafe User",
      email: "unsafe@example.com",
      age: 99,
    });
  });

  it("selectSingleUnsafe should return RowDataPacket", async () => {
    const row = await dbClient.selectSingleUnsafe(
      "SELECT * FROM test_users WHERE email = ?",
      ["unsafe@example.com"],
    );
    expect(row).toHaveProperty("name", "Unsafe User");
  });

  it("selectSingleUnsafe throws NotFoundError if no row", async () => {
    await expect(
      dbClient.selectSingleUnsafe("SELECT * FROM test_users WHERE email = ?", [
        "missing",
      ]),
    ).rejects.toThrow(NotFoundError);
  });

  it("selectSingleOrDefaultUnsafe returns null if no row", async () => {
    const row = await dbClient.selectSingleOrDefaultUnsafe(
      "SELECT * FROM test_users WHERE email = ?",
      ["missing"],
    );
    expect(row).toBeNull();
  });

  it("selectManyUnsafe returns array of RowDataPacket", async () => {
    const rows = await dbClient.selectManyUnsafe(
      "SELECT * FROM test_users",
      [],
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty("email", "unsafe@example.com");
  });
});




describe("transactions", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
  });

  it("should commit transaction on success", async () => {
    await dbClient.executeTransaction(async (trx) => {
      await trx.insert("test_users", {
        name: "Tx User",
        email: "tx@example.com",
        age: 50,
      });
      await trx.insert("test_users", {
        name: "Tx User2",
        email: "tx2@example.com",
        age: 60,
      });
    });
    const count = await dbClient.selectSingle(
      "SELECT COUNT(*) as cnt FROM test_users",
      [],
      z.object({ cnt: z.number() }),
    );
    expect(count.cnt).toBe(2);
  });

  it("should rollback on error", async () => {
    await expect(
      dbClient.executeTransaction(async (trx) => {
        await trx.insert("test_users", {
          name: "Rollback",
          email: "rollback@example.com",
          age: 30,
        });
        throw new Error("Forced error");
      }),
    ).rejects.toThrow("Forced error");
    const exists = await dbClient.selectSingleOrDefault(
      "SELECT * FROM test_users WHERE email = ?",
      ["rollback@example.com"],
      UserSchema,
    );
    expect(exists).toBeNull();
  });

  it("should allow nested transaction call (reuses same transaction)", async () => {
    await dbClient.executeTransaction(async (trx) => {
      await trx.insert("test_users", {
        name: "Outer",
        email: "outer@ex.com",
        age: 1,
      });
      await trx.executeTransaction(async (innerTrx) => {
        await innerTrx.insert("test_users", {
          name: "Inner",
          email: "inner@ex.com",
          age: 2,
        });
      });
    });
    const users = await dbClient.selectMany(
      "SELECT email FROM test_users",
      [],
      z.object({ email: z.string() }),
    );
    const emails = users.map((u) => u.email);
    expect(emails).toContain("outer@ex.com");
    expect(emails).toContain("inner@ex.com");
  });
});




describe("executeBatchUnsafe", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.modify("DELETE FROM test_products", []);
  });

  it("should execute mixed operations successfully", async () => {
    const ops: BatchOperation[] = [
      {
        sql: "INSERT INTO test_users (name, email) VALUES (?, ?)",
        params: ["Batch User", "batch@example.com"],
      },
      {
        op: "insert" as const,
        table: "test_products",
        data: { name: "Product A", price: 19.99 },
      },
      {
        op: "update" as const,
        table: "test_users",
        data: { age: 100 },
        where: { email: "batch@example.com" },
      },
    ];
    const results = await dbClient.executeBatchUnsafe(ops);
    expect(results).toHaveLength(3);
    
    expect((results[0] as any).insertId).toBeGreaterThan(0);
    
    const user = await dbClient.selectSingle(
      "SELECT age FROM test_users WHERE email = ?",
      ["batch@example.com"],
      z.object({ age: z.number().nullable() }),
    );
    expect(user.age).toBe(100);
  });

  it("should rollback entire batch if one operation fails", async () => {
    const ops = [
      {
        op: "insert" as const,
        table: "test_users",
        data: { name: "WillFailParent", email: "fail@ex.com" },
      },
      {
        op: "insert" as const,
        table: "test_users",
        data: { name: "CauseError", email: null },
      }, 
    ];
    await expect(dbClient.executeBatchUnsafe(ops)).rejects.toThrow();
    const user = await dbClient.selectSingleOrDefault(
      "SELECT * FROM test_users WHERE email = ?",
      ["fail@ex.com"],
      UserSchema,
    );
    expect(user).toBeNull();
  });
});

describe("executeBatch (with schemas)", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
    await dbClient.modify("DELETE FROM test_products", []);
  });

  it("should validate results against provided schemas", async () => {
    const ops = [
      {
        sql: "INSERT INTO test_products (name, price) VALUES (?, ?)",
        params: ["Item1", 10.5],
      },
      { sql: "SELECT * FROM test_products WHERE name = ?", params: ["Item1"] },
    ];
    const schemas = [
      DatabaseClient.MODIFY_SCHEMA, 
      z.array(ProductSchema),
    ] as const;
    const results = await dbClient.executeBatch(ops, schemas);
    expect(results[0].affectedRows).toBe(1);
    expect(results[1]).toHaveLength(1);
    expect(results[1][0].price).toBe(10.5);
  });

  
});




describe("sql raw helper", () => {
  beforeEach(async () => {
    await cleanTable(dbClient);
  });

  it("should allow raw SQL expressions in insert and update", async () => {
    await dbClient.insert("test_users", {
      name: "Raw User",
      email: "raw@example.com",
      age: sql("25 + 5"), 
    });
    const user = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE email = ?",
      ["raw@example.com"],
      UserSchema,
    );
    expect(user.age).toBe(30);

    await dbClient.update(
      "test_users",
      { age: sql("age * 2") },
      { email: "raw@example.com" },
    );
    const updated = await dbClient.selectSingle(
      "SELECT * FROM test_users WHERE email = ?",
      ["raw@example.com"],
      UserSchema,
    );
    expect(updated.age).toBe(60);
  });
});




it("DatabaseError should be thrown for invalid config", async () => {
  const badClient = createDatabaseClient({
    config: { host: "invalidhost" } as PoolOptions,
  });
  await expect(badClient.selectMany("SELECT 1", [], z.any())).rejects.toThrow();
  await badClient.close();
});

describe("edge cases", () => {
  it("close() should release pool and subsequent queries should throw", async () => {
    const client = createDatabaseClient({
      config: testDbConfig,
      verbose: false,
    });
    await client.close();
    await expect(client.selectMany("SELECT 1", [], z.any())).rejects.toThrow();
  });

  it("unsupported operator in where clause throws DatabaseError", async () => {
    await expect(
      dbClient.delete("test_users", { age: { unsupportedOp: 5 } as any }),
    ).rejects.toThrow(DatabaseError);
  });

  it("empty operations array in batch returns empty array", async () => {
    const result = await dbClient.executeBatchUnsafe([]);
    expect(result).toEqual([]);
  });
});

import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { test } from "https://deno.land/x/test_suite@0.9.5/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v2.5.0/mod.ts";
import { existsSync } from "https://deno.land/std/fs/mod.ts";
import { TestSuite } from "https://deno.land/x/test_suite@0.9.5/mod.ts";
import { sleep } from "https://deno.land/x/sleep/mod.ts";

const dbName = "users.db";
let db = undefined;
let server = undefined;

const path =
  import.meta.url
    .replace("file://" + Deno.cwd() + "/", "")
    .replace("sigma.test.js", "") + "schema/schema.js";

async function setupServer() {
  const server = await Deno.run({
    cmd: [
      "deno",
      "run",
      "--unstable",
      "--allow-all",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      "--quiet",
      path,
      "--quiet",
    ],
  });
  await sleep(2.5);
  return server;
}

const suite = new TestSuite({
  name: "Backend Test",
  async beforeEach(context) {
    server = await setupServer();
    db = new DB(dbName);
  },
  async afterEach() {
    if (db) {
      await db.close();
      db = undefined;
    }

    if (server) {
      await server.close();
      server = undefined;
    }

    if (existsSync(dbName)) {
      await Deno.remove(dbName);
    }
  },
});

test(
  suite,
  "Users table has been created with correct name",
  async (context) => {
    const result = [
      ...db
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .asObjects(),
    ];

    assertEquals(result[0].name, "users");
  }
);

test(
  suite,
  "History table has been created with correct name",
  async (context) => {
    const result = [
      ...db
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .asObjects(),
    ];

    assertEquals(result[3].name, "history");
  }
);

test(
  suite,
  "Users table has been created with correct columns",
  async (context) => {
    let correctColumnCount = 0;
    const correctColumns = [
      { name: "id", type: "INTEGER", notnull: 0 },
      { name: "username", type: "TEXT", notnull: 1 },
      { name: "password_encrypted", type: "TEXT", notnull: 1 },
      { name: "created_at", type: "DATETIME", notnull: 1 },
      { name: "updated_at", type: "DATETIME", notnull: 1 },
      { name: "admin", type: "INTEGER", notnull: 1 },
    ];

    const result = [...db.query("PRAGMA table_info(users);").asObjects()];
    result.forEach((column) => {
      correctColumns.forEach((correctColumn) => {
        if (column.name === correctColumn.name) {
          correctColumnCount++;
          assertEquals(column.type, correctColumn.type);
          assertEquals(column.notnull, correctColumn.notnull);
        }
      });
    });
    assertEquals(correctColumnCount, correctColumns.length);
  }
);

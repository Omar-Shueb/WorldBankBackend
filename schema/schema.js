import { DB } from "https://deno.land/x/sqlite/mod.ts";

try {
  await Deno.remove("users.db");
} catch {
  const db = new DB("./users.db");
  await db.query(
    `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL, 
    admin BOOLEAN

  )`
  );

  // const db = new DB('./votes.db')
  await db.query(`CREATE TABLE sessions (
  uuid TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  user_id INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);
}

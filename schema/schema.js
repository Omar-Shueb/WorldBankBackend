import { DB } from "https://deno.land/x/sqlite/mod.ts";

try {
  await Deno.remove("users.db");
} catch {
  const db = new DB("./users.db");
  await db.query(
    `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_encrypted TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL, 
    admin INTEGER NOT NULL DEFAULT FALSE
  )`
  );

  await db.query(`CREATE TABLE sessions (
  uuid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  logged_in INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

  await db.query(`CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  country_id TEXT NOT NULL,
  indicator_id TEXT,
  year INTEGER,
  year_end INTEGER,
  created_at DATETIME NOT NULL,
  country_name TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);
}

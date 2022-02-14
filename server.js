import { Application } from "https://deno.land/x/abc/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v2.5.0/mod.ts";
import { abcCors } from "https://deno.land/x/cors/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { v4 } from "https://deno.land/std/uuid/mod.ts";

const db = new DB("users.db");
const app = new Application();
const PORT = 8080;

const corsConfig = abcCors({
  origin: "*",
  allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "User-Agent"],
  credentials: true,
});

app
  .use(corsConfig)
  .post("/login", (server) => postLogin(server))
  .post("/createaccount", (server) => postAccount(server))
  .start({ port: PORT });

console.log(`Server running on http://localhost:${PORT}`);

async function postLogin(server) {
  try {
    const { username, password } = await server.body;
    if (!username || !password) {
      return server.json({ success: false, error: "Need to include a username and password" }, 400);
    }
    // Get the users password stored in the database.
    const [response] = [
      ...(await db
        .query("SELECT id, username, password_encrypted FROM users WHERE username = ?", [username])
        .asObjects()),
    ];
    // evaluates to true or false if the passwords match using bcrypt.compare as this accounts for salt.
    const authenticated = await bcrypt.compare(password, response.password_encrypted);

    if (authenticated) {
      // generate a session token and add it to the sessions db and add a cookie.
      const sessionId = v4.generate();
      await db.query("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, datetime('now'))", [
        sessionId,
        response.id,
      ]);
      server.setCookie({
        name: "sessionId",
        value: sessionId,
      });
      return server.json({ success: true }, 200);
    } else {
      return server.json({ success: false, error: "Username and Password are incorrect" }, 400);
    }
  } catch (error) {
    return server.json({ success: false, error: error }, 500);
  }
}

async function postAccount(server) {
  try {
    const { username, password } = await server.body;
    if (!username || !password) {
      return server.json({ success: false, error: "Need to include a username and password" }, 400);
    }
    // generate encrypted password using bcrypt and store in the db.
    const passwordEncrypted = await bcrypt.hash(password);
    await db.query(
      "INSERT INTO users(username, password, created_at, updated_at, admin) VALUES (?, ?, ?, datetime('now'), datetime('now'), FALSE)",
      [username, passwordEncrypted, salt]
    );
    return server.json({ success: true }, 200);
  } catch (error) {
    console.error(error);
    return server.json({ success: false, error: error }, 500);
  }
}

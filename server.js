import { Application } from "https://deno.land/x/abc/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v2.5.0/mod.ts";
import { abcCors } from "https://deno.land/x/cors/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { v4 } from "https://deno.land/std/uuid/mod.ts";

import { Client } from "https://deno.land/x/postgres@v0.11.3/mod.ts";

const client = new Client(
  "postgres://czreijar:TJ2StTuQIl2CoRoinQTwPxk8pBGfdf6t@kandula.db.elephantsql.com/czreijar"
);
await client.connect();

const db = new DB("./schema/users.db");

const app = new Application();
const PORT = 8080;

const corsConfig = abcCors({
  origin: true,
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "User-Agent",
  ],
  credentials: true,
});

app
  .use(corsConfig)
  .post("/login", (server) => postLogin(server))
  .post("/createaccount", (server) => postAccount(server))
  .get("/search", (server) => searchByCountry(server))
  .get("/indicators", getDistinctIndicators)
  .start({ port: PORT });

console.log(`Server running on http://localhost:${PORT}`);

async function postLogin(server) {
  try {
    const { username, password } = await server.body;
    if (!username || !password) {
      return server.json(
        { success: false, error: "Need to include a username and password" },
        400
      );
    }
    // Get the users password stored in the database.
    const [response] = [
      ...(await db
        .query(
          "SELECT id, username, password_encrypted FROM users WHERE username = ?",
          [username]
        )
        .asObjects()),
    ];
    // evaluates to true or false if the passwords match using bcrypt.compares.
    const authenticated = await bcrypt.compare(
      password,
      response.password_encrypted
    );

    if (authenticated) {
      // generate a session token and add it to the sessions db and add a cookie.
      const sessionId = v4.generate();
      await db.query(
        "INSERT INTO sessions (uuid, user_id, created_at) VALUES (?, ?, datetime('now'))",
        [sessionId, response.id]
      );
      server.setCookie({
        name: "sessionId",
        value: sessionId,
      });
      return server.json({ success: true }, 200);
    } else {
      return server.json(
        { success: false, error: "Username and Password are incorrect" },
        400
      );
    }
  } catch (error) {
    return server.json({ success: false, error: error }, 500);
  }
}

async function postAccount(server) {
  try {
    const { username, password } = await server.body;
    if (!username || !password) {
      return server.json(
        { success: false, error: "Need to include a username and password" },
        400
      );
    }
    // generate encrypted password using bcrypt and store in the db.
    const passwordEncrypted = await bcrypt.hash(password);
    await db.query(
      "INSERT INTO users(username, password_encrypted, created_at, updated_at, admin) VALUES (?, ?, datetime('now'), datetime('now'), FALSE)",
      [username, passwordEncrypted]
    );
    return server.json({ success: true }, 200);
  } catch (error) {
    console.error(error);
    return server.json({ success: false, error: error }, 500);
  }
}

async function searchByCountry(server) {
  // get params from the url queries
  const { country, indicator, year } = await server.queryParams;
  // construct the query depending on which parameters are present
  const countryQuery = ` WHERE countryname = '${country}'`;
  let indicatorQuery = "";
  let yearQuery = "";
  if (indicator) {
    indicatorQuery = ` AND indicatorname = '${indicator}'`;
  }
  if (year) {
    yearQuery = ` AND year = ${year}`;
  }
  if (country) {
    const query =
      "SELECT countryname, indicatorname, year, value FROM Indicators" +
      countryQuery +
      indicatorQuery +
      yearQuery;
    const response = await client.queryObject(query);
    const data = response.rows;
    return server.json(data, 200);
  } else {
    return server.json(400);
  }
}

async function getDistinctIndicators(server) {
  const indicators = (
    await client.queryObject("SELECT DISTINCT IndicatorName FROM Indicators;")
  ).rows;

  let format = [];
  indicators.forEach((indicator) => {
    console.log(Object.keys(indicator)[0]);
    let newFormat = {
      value: indicator["indicatorname"],
      label: indicator["indicatorname"],
    };
    format.push(newFormat);
  });
  console.log(format);
  server.json(format, 200);
}

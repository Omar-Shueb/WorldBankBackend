import { Application } from "https://deno.land/x/abc/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v2.5.0/mod.ts";
import { abcCors } from "https://deno.land/x/cors/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { v4 } from "https://deno.land/std/uuid/mod.ts";

import { Client } from "https://deno.land/x/postgres@v0.11.3/mod.ts";

import { config } from "https://deno.land/x/dotenv/mod.ts";

const DENO_ENV = Deno.env.get("DENO_ENV") ?? "development";

config({ path: `./.env.${DENO_ENV}`, export: true });

const client = new Client(
  "postgres://czreijar:TJ2StTuQIl2CoRoinQTwPxk8pBGfdf6t@kandula.db.elephantsql.com/czreijar"
);
await client.connect();

const db = new Client(Deno.env.get("PG_URL"));
await db.connect();

try {
  await db.queryObject(`DROP TABLE IF EXISTS users, sessions, history;`);
} catch (error) {
  console.log(error);
}

await db.queryObject(
  `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_encrypted TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL, 
    admin BOOLEAN NOT NULL DEFAULT FALSE
  )`
);

await db.queryObject(`CREATE TABLE sessions (
  uuid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  logged_in BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT user_id FOREIGN KEY(user_id) REFERENCES users(id)
)`);

await db.queryObject(`CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  country_id TEXT NOT NULL,
  indicator_id TEXT,
  year INTEGER,
  year_end INTEGER,
  created_at TIMESTAMP NOT NULL,
  country_name TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  CONSTRAINT history FOREIGN KEY(user_id) REFERENCES users(id)
)`);
const adminPassword = "admin";
const adminPasswordEncrypted = await bcrypt.hash(adminPassword);
await db.queryObject({
  text: `INSERT INTO users (username, password_encrypted, created_at, updated_at, admin) VALUES ($1, $2, NOW()::timestamp, NOW()::timestamp, TRUE )`,
  args: ["admin", adminPasswordEncrypted],
});

// const db = new DB("./schema/users.db");

const app = new Application();
const PORT = Deno.env.get("PORT") || 80;

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
  .post("/search", (server) => postSearch(server))
  .get("indicators/:country", (server) => getIndicators(server))
  .post("/login", (server) => postLogin(server))
  .post("/createaccount", (server) => postAccount(server))
  .get("/session", (server) => getSession(server))
  .patch("/session", (server) => patchSession(server))
  .get("/history", (server) => getSearchHistory(server))
  .start({ port: parseInt(PORT) });

console.log(`Server running on http://localhost:"${PORT}`);

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
    const [response] = (
      await db.queryObject({
        text: "SELECT id, username, password_encrypted FROM users WHERE username = $1",
        args: [username],
      })
    ).rows;

    // evaluates to true or false if the passwords match using bcrypt.compares.
    const authenticated = await bcrypt.compare(
      password,
      response.password_encrypted
    );

    if (authenticated) {
      // generate a session token and add it to the sessions db and add a cookie.
      const sessionId = v4.generate();
      await db.queryObject({
        text: "INSERT INTO sessions (uuid, user_id, logged_in, created_at, updated_at) VALUES ($1, $2, TRUE, NOW()::timestamp, NOW()::timestamp)",
        args: [sessionId, response.id],
      });
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
    console.log(error);
    return server.json(
      { success: false, error: "Username and password not recognised" },
      400
    );
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
    const isUsernameUnique = (
      await db.queryObject({
        text: `SELECT id from users WHERE username = $1`,
        args: [username],
      })
    ).rows.length;

    if (isUsernameUnique) {
      return server.json(
        { success: false, error: "That username is already taken" },
        400
      );
    }
    // generate encrypted password using bcrypt and store in the db.
    const passwordEncrypted = await bcrypt.hash(password);
    await db.queryObject({
      text: "INSERT INTO users(username, password_encrypted, created_at, updated_at, admin) VALUES ($1, $2, NOW()::timestamp, NOW()::timestamp, FALSE)",
      args: [username, passwordEncrypted],
    });
    return server.json({ success: true }, 200);
  } catch (error) {
    console.error(error);
    return server.json({ success: false, error: error }, 500);
  }
}

async function postSearch(server) {
  // get params from the body
  const { country, indicator, year, yearEnd } = await server.body;
  let countries = typeof country === "object" ? country.join(", ") : country;
  let indicators =
    typeof indicator === "object" ? indicator.join(", ") : indicator;

  // Format the code for postgres
  const countryCode = countries
    .split(", ")
    .map((code) =>
      typeof country === "object" ? `'${code}'` : code.toString()
    )
    .join(", ");
  const indicatorCode = indicators
    .split(", ")
    .map((code) =>
      typeof indicator === "object" ? `'${code}'` : code.toString()
    )
    .join(", ");
  // construct the query depending on which parameters are present
  const countryQuery = country ? `countrycode in (${countryCode})` : "";
  const indicatorQuery = indicator ? `indicatorcode in (${indicatorCode})` : "";
  const yearQuery = year ? `year >= ${year}` : "";
  const yearEndQuery = yearEnd ? `year <= ${yearEnd}` : "";
  const whereCondition = [];
  for (let condition of [
    countryQuery,
    indicatorQuery,
    yearQuery,
    yearEndQuery,
  ]) {
    if (condition) {
      whereCondition.push(condition);
    }
  }
  let query =
    "SELECT countryname, indicatorname, year, value FROM indicators WHERE " +
    whereCondition.join(" AND ");
  const response = await client.queryObject(query);
  const data = response.rows;
  addSearchToHistory(
    server,
    countryCode,
    indicatorCode,
    year,
    yearEnd,
    countryQuery,
    indicatorQuery
  );
  return server.json(data, 200);
}

//adds the search to history table
async function addSearchToHistory(
  server,
  country,
  indicator,
  year,
  yearEnd,
  countryQuery,
  indicatorQuery
) {
  const user_id = await getCurrentUser(server);
  if (user_id) {
    const countryNames = await getCountryNames(countryQuery);
    const indicatorNames = await getIndicatorNames(indicatorQuery);
    db.queryObject({
      text: `INSERT INTO history (user_id, country_id, indicator_id, year, year_end, created_at, country_name, indicator_name) VALUES ($1,$2,$3,$4,$5,NOW()::timestamp,$6,$7)`,
      args: [
        user_id,
        country,
        indicator,
        year,
        yearEnd,
        countryNames,
        indicatorNames,
      ],
    });
  }
}

async function getCountryNames(codes) {
  let query = `SELECT DISTINCT countryname FROM indicators WHERE $1`;
  const response = await client.queryObject({ text: query, args: [codes] });
  const names = response.rows
    .map((x) => {
      return x.countryname;
    })
    .join(", ");
  return names;
}

async function getIndicatorNames(codes) {
  let query = `SELECT DISTINCT indicatorname FROM indicators WHERE $1`;
  const response = await client.queryObject({ text: query, args: [codes] });
  const names = response.rows
    .map((x) => {
      return x.indicatorname;
    })
    .join(", ");
  return names;
}

async function getSession(server) {
  try {
    const id = await getCurrentUser(server);
    if (id) {
      return server.json({ success: true }, 200);
    } else {
      return server.json({ success: false }, 400);
    }
  } catch (error) {
    return server.json({ success: false }, 500);
  }
}

async function patchSession(server) {
  try {
    const { sessionId } = await await server.cookies;
    if (sessionId) {
      await db.queryObject({
        text: `UPDATE sessions
        SET logged_in = FALSE, updated_at = NOW()::timestamp
        WHERE uuid = $1`,
        args: [sessionId],
      });
    }
    server.setCookie({
      name: "sessionId",
      value: "",
      expires: new Date(),
    });
    return server.json({ success: true }, 200);
  } catch (error) {
    return server.json({ success: false }, 500);
  }
}

async function getCurrentUser(server) {
  try {
    const { sessionId } = await server.cookies;
    if (sessionId) {
      const [user_id] = (
        await db.queryObject({
          text: `SELECT user_id FROM sessions WHERE uuid = $1 AND logged_in = TRUE AND EXISTS (SELECT * FROM users WHERE users.id = sessions.user_id)`,
          args: [sessionId],
        })
      ).rows;
      return user_id.user_id ? user_id.user_id : false;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function getIndicators(server) {
  try {
    const { country } = await server.params;
    const query = `SELECT DISTINCT indicatorname, indicatorcode FROM indicators WHERE countrycode = '${country.toUpperCase()}'`;
    const response = await client.queryObject(query);
    let data = response.rows;
    data.sort(sortIndicators);
    const indicators = data.map((indicator) => {
      return { value: indicator.indicatorcode, label: indicator.indicatorname };
    });
    return server.json({ success: true, indicators: indicators });
  } catch (error) {
    return server.json({ success: false });
  }
}

function sortIndicators(a, b) {
  return a.indicatorname > b.indicatorname ? 1 : -1;
}

async function getSearchHistory(server) {
  const user_id = await getCurrentUser(server);

  if (user_id) {
    const isAdmin = [
      ...db.queryObject({
        text: `SELECT id FROM users WHERE admin = 1 AND id = $1`,
        args: [user_id],
      }).rows,
    ].length;

    if (isAdmin) {
      const history = [
        ...db.queryObject(
          `SELECT history.id as history_id , country_id , indicator_id, year, year_end, history.created_at, country_name, indicator_name, users.id , users.username FROM history JOIN users ON users.id = history.user_id`
        ).rows,
      ];
      return server.json(history, 200);
    } else {
      const history = [
        ...db.queryObject({
          text: `SELECT id as history_id , country_id , indicator_id , year, year_end, created_at , country_name, indicator_name from history where user_id = $1 `,
          args: [user_id],
        }).rows,
      ];

      server.json(history, 200);
    }
  } else {
    server.json({ success: false }, 404);
  }
}

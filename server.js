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
  .post("/search", (server) => searchByCountry(server))
  .get("indicators/:country", (server) => getIndicators(server))
  .post("/login", (server) => postLogin(server))
  .post("/createaccount", (server) => postAccount(server))
  .get("/session", (server) => getSession(server))
  .patch("/session", (server) => patchSession(server))
  .get("/history", (server) => getSearchHistory(server))
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
        "INSERT INTO sessions (uuid, user_id, logged_in, created_at, updated_at) VALUES (?, ?, TRUE, datetime('now'), datetime('now'))",
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
    const isUsernameUnique = [
      ...db
        .query(`SELECT id from users WHERE username = ?`, [username])
        .asObjects(),
    ].length;

    if (isUsernameUnique) {
      return server.json(
        { success: false, error: "That username is already taken" },
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
  const { country, indicator, year, yearEnd } = await server.body;
  // construct the query depending on which parameters are present

  await addSearchToHistory(server, country, indicator, year, yearEnd);
  const countryQuery = ` WHERE countrycode = '${country}'`;
  let indicatorQuery = "";
  let yearQuery = "";

  if (indicator) {
    indicatorQuery = ` AND indicatorcode = '${indicator}'`;
  }

  if (year && !yearEnd) {
    yearQuery = ` AND year BETWEEN ${year} AND 2015`;
  }

  if (year && yearEnd) {
    yearQuery = ` AND year BETWEEN ${year} AND ${yearEnd}`;
  }

  if (!year && yearEnd) {
    yearQuery = ` AND year BETWEEN 1960 AND ${yearEnd}`;
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

//adds the search to history table
async function addSearchToHistory(server, country, indicator, year, yearEnd) {
  const user_id = await getCurrentUser(server);
  if (user_id) {
    const names = await getNamesFromCodes(country, indicator);
    const values = Object.values(names); // Values is an object with the keys country_name and indicator_name respectively
    console.log(values);
    db.query(
      `INSERT INTO history (user_id, country_id, indicator_id, year, year_end, created_at, country_name, indicator_name) VALUES (?,?,?,?,?,DATETIME('now'),?,?)`,
      [user_id, country, indicator, year, yearEnd, values[0], values[1]]
    );
  }
}
async function getNamesFromCodes(country_id, indicator_id) {
  let query = `SELECT DISTINCT CountryName, IndicatorName FROM indicators WHERE CountryCode = '${country_id}'`;
  if (indicator_id) {
    query += `AND IndicatorCode = '${indicator_id}'`;
  }

  const response = await client.queryObject(query);

  return response.rows[0];
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
      await db.query(
        `UPDATE sessions
        SET logged_in = FALSE, updated_at = datetime('now')
        WHERE uuid = ?`,
        [sessionId]
      );
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
    const { sessionId } = await await server.cookies;
    if (sessionId) {
      const [[user_id]] = [
        ...(await db.query(
          `SELECT user_id FROM sessions WHERE uuid = ? AND logged_in = TRUE AND EXISTS (SELECT * FROM users WHERE users.id = sessions.user_id)`,
          [sessionId]
        )),
      ];
      return user_id ? user_id : false;
    } else {
      return false;
    }
  } catch (error) {
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
    const history = [
      ...db
        .query(
          `SELECT id , country_id , indicator_id , year, year_end, created_at , country_name, indicator_name from history where user_id = ? `,
          [user_id]
        )
        .asObjects(),
    ];

    server.json(history, 200);
  } else {
    server.json({ success: false }, 404);
  }
}

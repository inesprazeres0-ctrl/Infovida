require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const port = Number(process.env.PORT) || 3000;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const defaultDatabasePath = path.join(__dirname, "infovida.sqlite");
const previousDatabasePath = path.join(__dirname, "data", "infovida.sqlite");
const configuredDatabasePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : defaultDatabasePath;
const viewsDirectory = path.join(__dirname, "views");
const cookieName = "infovida_admin";
const sessionDurationSeconds = 60 * 60 * 8;
let database;

if (!adminPassword || !sessionSecret) {
  throw new Error("Configure ADMIN_PASSWORD e SESSION_SECRET no ambiente antes de iniciar.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + sessionDurationSeconds * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function hasAdminSession(req) {
  const token = req.cookies?.[cookieName] || parseCookies(req.headers.cookie)[cookieName];
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).expiresAt > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return ["", ""];
      return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
    })
  );
}

function requireAdmin(req, res, next) {
  if (!hasAdminSession(req)) {
    return res.status(401).json({ error: "Acesso restrito. Entre no painel novamente." });
  }
  next();
}

function openDatabase(filePath, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    let connection;
    connection = new sqlite3.Database(filePath, mode, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(connection);
    });
  });
}

function run(databaseConnection, sql, parameters = []) {
  return new Promise((resolve, reject) => {
    databaseConnection.run(sql, parameters, function (error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all(databaseConnection, sql, parameters = []) {
  return new Promise((resolve, reject) => {
    databaseConnection.all(sql, parameters, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function get(databaseConnection, sql, parameters = []) {
  return new Promise((resolve, reject) => {
    databaseConnection.get(sql, parameters, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function closeDatabase(databaseConnection) {
  return new Promise((resolve, reject) => {
    databaseConnection.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createSchema(databaseConnection) {
  await run(databaseConnection, "PRAGMA journal_mode = WAL");
  await run(databaseConnection, `
    CREATE TABLE IF NOT EXISTS infovida_submissions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await run(databaseConnection, `
    CREATE TABLE IF NOT EXISTS infovida_migrations (
      name TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    )
  `);
}

async function migratePreviousDatabase(databaseConnection) {
  if (!fs.existsSync(previousDatabasePath) || previousDatabasePath === configuredDatabasePath) return;
  const migrationName = "data-infovida-sqlite-to-root-v1";
  const completedMigration = await get(databaseConnection,
    "SELECT name FROM infovida_migrations WHERE name = ?", [migrationName]);
  if (completedMigration) return;

  const previousDatabase = await openDatabase(previousDatabasePath, sqlite3.OPEN_READONLY);
  let rows;
  try {
    rows = await all(previousDatabase, `
      SELECT id, name, details, created_at
      FROM infovida_submissions
      ORDER BY created_at
    `);
  } catch (error) {
    if (error.code === "SQLITE_ERROR" && /no such table/i.test(error.message)) return;
    throw error;
  } finally {
    await closeDatabase(previousDatabase);
  }

  await run(databaseConnection, "BEGIN TRANSACTION");
  try {
    for (const row of rows) {
      await run(databaseConnection, `
        INSERT OR IGNORE INTO infovida_submissions (id, name, details, created_at)
        VALUES (?, ?, ?, ?)
      `, [row.id, row.name, row.details, row.created_at]);
    }
    await run(databaseConnection,
      "INSERT INTO infovida_migrations (name, completed_at) VALUES (?, ?)",
      [migrationName, new Date().toISOString()]);
    await run(databaseConnection, "COMMIT");
    console.log(`${rows.length} inscricoes verificadas durante a migracao para ${configuredDatabasePath}.`);
  } catch (error) {
    await run(databaseConnection, "ROLLBACK").catch(() => {});
    throw error;
  }
}

async function initializeStorage() {
  const targetAlreadyExisted = fs.existsSync(configuredDatabasePath);
  try {
    database = await openDatabase(configuredDatabasePath);
    await createSchema(database);
  } catch (error) {
    const canUseFallback = configuredDatabasePath !== defaultDatabasePath &&
      ["EACCES", "EPERM", "EROFS", "ENOTDIR", "EEXIST", "SQLITE_CANTOPEN"].includes(error.code);
    if (!canUseFallback) throw error;

    console.warn(
      `DB_PATH inacessivel (${configuredDatabasePath}); usando SQLite temporario em ${defaultDatabasePath}. ` +
      "No Render Free, os dados podem ser perdidos em reinicios ou deploys."
    );
    database = await openDatabase(defaultDatabasePath);
    await createSchema(database);
  }

  if (!targetAlreadyExisted) await migratePreviousDatabase(database);
}

async function saveSubmission(submission) {
  const saved = { id: crypto.randomUUID(), ...submission };
  await run(database, `
    INSERT INTO infovida_submissions (id, name, details, created_at)
    VALUES (?, ?, ?, ?)
  `, [saved.id, saved.name, JSON.stringify(saved), saved.createdAt]);
  return saved;
}

async function listSubmissions() {
  const rows = await all(database, `
    SELECT details FROM infovida_submissions ORDER BY created_at DESC
  `);
  return rows.map((row) => JSON.parse(row.details));
}

function cleanText(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
});

const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

app.get("/infovida-admin.html", (req, res) => {
  res.sendFile(path.join(viewsDirectory, hasAdminSession(req) ? "admin.html" : "admin-login.html"));
});

app.get("/", (req, res) => res.redirect(302, "/seguro-pessoas"));
app.get("/index.html", (req, res) => res.redirect(302, "/seguro-pessoas"));
app.get(["/seguro-pessoas", "/servidor-publico"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const providedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const expectedHash = crypto.createHash("sha256").update(adminPassword).digest();
  const providedHash = crypto.createHash("sha256").update(providedPassword).digest();

  if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
    return res.status(401).json({ error: "Senha incorreta. Confira e tente novamente." });
  }

  res.cookie(cookieName, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: sessionDurationSeconds * 1000,
    path: "/"
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});

app.get("/api/admin/submissions", requireAdmin, async (req, res, next) => {
  try {
    res.json(await listSubmissions());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/submissions", requireAdmin, async (req, res, next) => {
  try {
    const result = await run(database, "DELETE FROM infovida_submissions");
    res.json({ ok: true, deletedCount: result.changes });
  } catch (error) {
    next(error);
  }
});

app.post("/api/submissions", submissionLimiter, async (req, res, next) => {
  try {
    if (cleanText(req.body?.website, 200)) return res.status(201).json({ ok: true });

    const name = cleanText(req.body?.name, 100);
    const requestedAudience = cleanText(req.body?.audience, 40);
    const audience = requestedAudience || "seguro-pessoas";
    const ageOrBirthdate = cleanText(req.body?.ageOrBirthdate, 30);
    const profession = cleanText(req.body?.profession, 100);
    const maritalStatus = cleanText(req.body?.maritalStatus, 40);
    const gender = cleanText(req.body?.gender, 30);
    const genderOther = cleanText(req.body?.genderOther, 80);
    const whatsapp = cleanText(req.body?.whatsapp, 30);
    const hasChildren = req.body?.hasChildren === true;
    const childrenCount = hasChildren ? Number(req.body?.childrenCount) : 0;
    const allowedGenders = new Set([
      "Masculino",
      "Feminino",
      "Outro",
      "Prefiro não informar"
    ]);
    const allowedAudiences = new Set(["seguro-pessoas", "servidor-publico"]);

    if (
      name.length < 2 ||
      !allowedAudiences.has(audience) ||
      !ageOrBirthdate ||
      !profession ||
      !maritalStatus ||
      !allowedGenders.has(gender) ||
      (gender === "Outro" && !genderOther) ||
      whatsapp.replace(/\D/g, "").length < 10 ||
      !Number.isInteger(childrenCount) ||
      childrenCount < 0 ||
      childrenCount > 30
    ) {
      return res.status(400).json({ error: "Confira os campos e preencha as informacoes solicitadas." });
    }

    const saved = await saveSubmission({
      audience,
      name,
      ageOrBirthdate,
      profession,
      maritalStatus,
      gender,
      genderOther: gender === "Outro" ? genderOther : "",
      hasChildren,
      childrenCount,
      whatsapp,
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ ok: true, id: saved.id });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Ocorreu um erro. Tente novamente em instantes." });
});

initializeStorage()
  .then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Infovida disponivel na porta ${port}.`);
  });
  })
  .catch((error) => {
    console.error("Nao foi possivel inicializar o banco SQLite:", error);
    process.exit(1);
  });
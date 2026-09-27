require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT) || 3000;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const defaultDatabasePath = path.join(__dirname, "data", "infovida.sqlite");
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

function openDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const connection = new Database(filePath);
  try {
    connection.pragma("journal_mode = WAL");
    connection.exec(`
      CREATE TABLE IF NOT EXISTS infovida_submissions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

function initializeStorage() {
  try {
    database = openDatabase(configuredDatabasePath);
  } catch (error) {
    const canUseEphemeralFallback =
      configuredDatabasePath !== defaultDatabasePath &&
      ["EACCES", "EPERM", "EROFS", "ENOTDIR", "EEXIST", "SQLITE_CANTOPEN"].includes(error.code);
    if (!canUseEphemeralFallback) throw error;

    console.warn(
      `DB_PATH inacessivel (${configuredDatabasePath}); usando SQLite local temporario em ${defaultDatabasePath}. ` +
      "No Render Free, os dados podem ser perdidos em reinicios ou deploys."
    );
    database = openDatabase(defaultDatabasePath);
  }
}

function saveSubmission(submission) {
  const saved = { id: crypto.randomUUID(), ...submission };
  database.prepare(`
    INSERT INTO infovida_submissions (id, name, details, created_at)
    VALUES (?, ?, ?, ?)
  `).run(saved.id, saved.name, JSON.stringify(saved), saved.createdAt);
  return saved;
}

function listSubmissions() {
  return database.prepare(`
    SELECT details FROM infovida_submissions ORDER BY created_at DESC
  `).all().map((row) => JSON.parse(row.details));
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

app.delete("/api/admin/submissions", requireAdmin, (req, res, next) => {
  try {
    const result = database.prepare("DELETE FROM infovida_submissions").run();
    res.json({ ok: true, deletedCount: result.changes });
  } catch (error) {
    next(error);
  }
});

app.post("/api/submissions", submissionLimiter, async (req, res, next) => {
  try {
    if (cleanText(req.body?.website, 200)) return res.status(201).json({ ok: true });

    const name = cleanText(req.body?.name, 100);
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

    if (
      name.length < 2 ||
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

try {
  initializeStorage();
  app.listen(port, "0.0.0.0", () => {
    console.log(`Infovida disponivel na porta ${port}.`);
  });
} catch (error) {
  console.error("Nao foi possivel inicializar o banco SQLite:", error);
  process.exit(1);
}
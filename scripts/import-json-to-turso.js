require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@libsql/client");

async function main() {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!databaseUrl || !authToken) {
    throw new Error("Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente ou em .env.");
  }

  const inputFile = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "submissions.json"));
  const entries = JSON.parse(await fs.readFile(inputFile, "utf8"));
  if (!Array.isArray(entries)) throw new Error("O arquivo JSON precisa conter uma lista de contatos.");

  const database = createClient({ url: databaseUrl, authToken });
  try {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS infovida_submissions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    let imported = 0;
    for (let offset = 0; offset < entries.length; offset += 100) {
      const statements = entries.slice(offset, offset + 100).map((entry) => {
        const id = typeof entry.id === "string" ? entry.id : require("node:crypto").randomUUID();
        const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString();
        const details = { ...entry, id, createdAt };
        return {
          sql: `
            INSERT OR IGNORE INTO infovida_submissions (id, name, details, created_at)
            VALUES (?, ?, ?, ?)
          `,
          args: [id, String(entry.name || "Contato").trim().slice(0, 100), JSON.stringify(details), createdAt]
        };
      });
      const results = await database.batch(statements, "write");
      imported += results.reduce((sum, result) => sum + result.rowsAffected, 0);
    }

    console.log(`${imported} contato(s) novo(s) importado(s); ${entries.length} registro(s) lido(s).`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("Falha ao importar contatos para o Turso:", error.message);
  process.exitCode = 1;
});
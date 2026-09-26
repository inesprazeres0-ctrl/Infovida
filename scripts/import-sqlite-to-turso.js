require("dotenv").config();

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createClient } = require("@libsql/client");

async function main() {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!databaseUrl || !authToken) {
    throw new Error("Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente ou em .env.");
  }

  const localPath = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "infovida.sqlite"));
  const localDatabase = createClient({ url: pathToFileURL(localPath).href });
  const remoteDatabase = createClient({ url: databaseUrl, authToken });

  try {
    const localRows = await localDatabase.execute(
      "SELECT id, name, details, created_at FROM infovida_submissions ORDER BY created_at"
    );
    await remoteDatabase.execute(`
      CREATE TABLE IF NOT EXISTS infovida_submissions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    let imported = 0;
    for (let offset = 0; offset < localRows.rows.length; offset += 100) {
      const statements = localRows.rows.slice(offset, offset + 100).map((row) => ({
        sql: `
          INSERT OR IGNORE INTO infovida_submissions (id, name, details, created_at)
          VALUES (?, ?, ?, ?)
        `,
        args: [String(row.id), String(row.name), String(row.details), String(row.created_at)]
      }));
      const results = await remoteDatabase.batch(statements, "write");
      imported += results.reduce((sum, result) => sum + result.rowsAffected, 0);
    }

    console.log(`${imported} contato(s) novo(s) importado(s); ${localRows.rows.length} registro(s) lido(s) do SQLite.`);
  } finally {
    await Promise.all([localDatabase.close(), remoteDatabase.close()]);
  }
}

main().catch((error) => {
  console.error("Falha ao importar contatos SQLite para o Turso:", error.message);
  process.exitCode = 1;
});
// Applica le migrazioni SQL della cartella ./drizzle al database in DATABASE_URL.
// Usa solo dipendenze di runtime (drizzle-orm + pg), quindi funziona anche nel container.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  try {
    (await import("dotenv")).config();
  } catch {
    /* dotenv è opzionale */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL non impostata");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrazioni applicate.");
} catch (err) {
  console.error("Migrazione fallita:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}

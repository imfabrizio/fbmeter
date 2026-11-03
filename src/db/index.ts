import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB; __pool?: Pool };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL non impostata");
  // Pool piccolo: su piattaforme serverless ogni istanza apre le sue connessioni.
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  globalForDb.__pool = pool;
  return drizzle(pool, { schema });
}

/** Connessione creata al primo uso, così la build non richiede il database. */
export function getDb(): DB {
  if (!globalForDb.__db) globalForDb.__db = create();
  return globalForDb.__db;
}

export { schema };

import { Pool } from "pg";

// One pool for the process. Next.js dev reloads modules on every save, so
// stash it on `global` to avoid opening a fresh pool per hot-reload.
const g = globalThis as unknown as { pgPool?: Pool };

export const db =
  g.pgPool ??
  (g.pgPool = new Pool({
    // Vercel's own Postgres integration names its pooled connection string
    // POSTGRES_URL, not DATABASE_URL — support both rather than requiring
    // the variable to be duplicated by hand in every environment.
    connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
    max: 5,
  }));

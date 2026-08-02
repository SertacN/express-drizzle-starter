import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// Passing the schema enables the relational query API (`db.query.users.findFirst(...)`)
// on top of the plain select/insert builders.
export const db = drizzle(pool, { schema });

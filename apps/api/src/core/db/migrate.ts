import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    await migrate(db, { migrationsFolder: path.resolve(here, "migrations") });
    await pool.end();
    // Not the logger: this script runs BEFORE migrations, so app_logs may not exist yet.
    console.log("migrations applied");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

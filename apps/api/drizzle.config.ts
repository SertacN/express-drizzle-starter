import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

export default defineConfig({
	dialect: "postgresql",
	// The barrel: every table file re-exported from one place, so `db:generate` sees them all.
	schema: "./src/core/db/schema/index.ts",
	out: "./src/core/db/migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgresql://app:change-me@localhost:5432/app"
	}
});

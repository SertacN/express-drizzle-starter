/**
 * Creates a user from the command line — the way to get the first admin into a fresh database.
 *
 *   pnpm --filter api user:create <email> <password> <name> [role]
 */
import { eq } from "drizzle-orm";
import { USER_ROLES, type UserRole } from "shared";
import { db, pool } from "../src/core/db/client.js";
import { users } from "../src/core/db/schema/index.js";
import { hashPassword } from "../src/core/utils/password.js";

const [email, password, name, role = "admin"] = process.argv.slice(2);

if (!email || !password || !name) {
	console.error("usage: pnpm --filter api user:create <email> <password> <name> [role]");
	process.exit(1);
}
if (!USER_ROLES.includes(role as UserRole)) {
	console.error(`role must be one of: ${USER_ROLES.join(", ")}`);
	process.exit(1);
}

const [existing] = await db
	.select()
	.from(users)
	.where(eq(users.email, email.toLowerCase()))
	.limit(1);

if (existing) {
	console.error(`user already exists: ${email}`);
	await pool.end();
	process.exit(1);
}

const [created] = await db
	.insert(users)
	.values({
		email: email.toLowerCase(),
		name,
		role: role as UserRole,
		passwordHash: await hashPassword(password)
	})
	.returning();

console.log(`created ${created!.email} (${created!.role}) id=${created!.id}`);
await pool.end();

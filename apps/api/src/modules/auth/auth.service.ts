import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { AuthUser, ProfileUpdateInput, ProfileUpdateResponse } from "shared";
import { db } from "../../core/db/client.js";
import { refreshTokens, users } from "../../core/db/schema/index.js";
import { HttpError } from "../../core/http/middleware/errorHandler.js";
import {
    REFRESH_TOKEN_TTL_MS,
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
} from "../../core/utils/jwt.js";
import { hashPassword, verifyPassword } from "../../core/utils/password.js";
import { isWithinReuseGrace } from "../../core/utils/refresh-token.js";

type UserRow = typeof users.$inferSelect;

function toAuthUser(user: UserRow): AuthUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Opens one row per refresh token; `familyId` ties a whole login session together. */
async function issueTokens(user: UserRow, familyId: string) {
    const jti = randomUUID();
    await db.insert(refreshTokens).values({
        id: jti,
        userId: user.id,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return {
        accessToken: signAccessToken({ sub: user.id, role: user.role }),
        refreshToken: signRefreshToken({ sub: user.id, role: user.role, jti }),
    };
}

async function revokeFamily(familyId: string) {
    await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

async function revokeAllForUser(userId: string) {
    await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function register(input: { email: string; password: string; name: string }) {
    const email = input.email.toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Deliberately explicit: this endpoint is public, so an attacker can enumerate addresses
    // either way (the alternative is silently mailing the existing owner). If that matters for
    // your product, return 201 unconditionally and send a verification mail instead.
    if (existing) throw new HttpError(409, "email_taken");

    const [user] = await db
        .insert(users)
        .values({ email, name: input.name, passwordHash: await hashPassword(input.password) })
        .returning();

    return { ...(await issueTokens(user!, randomUUID())), user: toAuthUser(user!) };
}

export async function login(email: string, password: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

    // Same error for "no such user" and "wrong password" — never leak which one it was.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new HttpError(401, "invalid_credentials");
    }
    if (!user.isActive) throw new HttpError(403, "account_disabled");

    // Opportunistic cleanup: drop this user's expired token rows.
    await db
        .delete(refreshTokens)
        .where(and(eq(refreshTokens.userId, user.id), lt(refreshTokens.expiresAt, new Date())));

    return { ...(await issueTokens(user, randomUUID())), user: toAuthUser(user) };
}

export async function getProfile(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(401, "unauthorized");
    return { user: toAuthUser(user) };
}

/**
 * Rotation + reuse detection. The old token is burned and a new pair is issued; a token that
 * comes back after it was already spent is treated as stolen and takes its whole family down.
 */
export async function refreshSession(refreshToken: string) {
    let payload;
    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        throw new HttpError(401, "invalid_refresh_token");
    }

    const now = new Date();
    // Atomic claim: stamp used_at only if the row is still unused and unrevoked — of two
    // requests racing with the same token, exactly one wins.
    const [claimed] = await db
        .update(refreshTokens)
        .set({ usedAt: now })
        .where(
            and(
                eq(refreshTokens.id, payload.jti),
                isNull(refreshTokens.usedAt),
                isNull(refreshTokens.revokedAt),
            ),
        )
        .returning();

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) throw new HttpError(401, "invalid_refresh_token");

    if (!claimed) {
        // The row is either missing (forged/pruned) or already used/revoked.
        const [existing] = await db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.id, payload.jti))
            .limit(1);
        if (!existing) throw new HttpError(401, "invalid_refresh_token");

        // Grace window: a token handed out seconds ago is usually a race (a retried request,
        // a second tab that missed the rotation), not theft. The family survives and a new
        // pair from the same family is issued. Replays after the window still count as theft.
        if (isWithinReuseGrace(existing, now)) {
            return issueTokens(user, existing.familyId);
        }

        await revokeFamily(existing.familyId);
        throw new HttpError(401, "invalid_refresh_token");
    }

    if (claimed.expiresAt < now) throw new HttpError(401, "invalid_refresh_token");

    return issueTokens(user, claimed.familyId);
}

/** Idempotent: an invalid token is not an error, there is simply nothing to revoke. */
export async function logout(refreshToken: string) {
    let payload;
    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        return;
    }
    const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, payload.jti))
        .limit(1);
    if (row) await revokeFamily(row.familyId);
}

/**
 * The user's own name / password.
 *
 * Changing a password revokes ALL of the user's refresh tokens — but that would also kill the
 * tab making the request, whose access token could not be refreshed 15 minutes later. So the
 * caller gets a FRESH pair back: other devices are signed out, this session stays.
 */
export async function updateOwnProfile(
    userId: string,
    input: ProfileUpdateInput,
): Promise<ProfileUpdateResponse> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(401, "unauthorized");

    if (input.newPassword) {
        const ok = await verifyPassword(input.currentPassword!, user.passwordHash);
        if (!ok) throw new HttpError(400, "invalid_current_password");
    }

    const [updated] = await db
        .update(users)
        .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.newPassword ? { passwordHash: await hashPassword(input.newPassword) } : {}),
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

    let tokens: ProfileUpdateResponse["tokens"] = null;
    if (input.newPassword) {
        await revokeAllForUser(userId);
        tokens = await issueTokens(updated!, randomUUID());
    }

    return { user: toAuthUser(updated!), tokens };
}

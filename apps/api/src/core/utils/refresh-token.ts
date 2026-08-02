// Grace window for a client that missed the rotation: a token replayed inside it is not
// treated as theft. Kept short — the real protection is that replaying it after the window
// revokes the entire token family.
const REUSE_GRACE_MS = 10_000;

interface RefreshTokenRow {
    usedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
}

/**
 * Was this token handed out moments ago and still valid? Then the replay is a race
 * (a retried request, a second tab that missed the rotation), not a stolen token.
 */
export function isWithinReuseGrace(row: RefreshTokenRow, now: Date): boolean {
    if (row.revokedAt !== null || row.usedAt === null) return false;
    if (row.expiresAt < now) return false;
    return now.getTime() - row.usedAt.getTime() <= REUSE_GRACE_MS;
}

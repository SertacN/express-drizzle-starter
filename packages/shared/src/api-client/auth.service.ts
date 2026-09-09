import type {
    AuthTokens,
    AuthUser,
    LoginInput,
    LoginResponse,
    ProfileUpdateInput,
    ProfileUpdateResponse,
    RegisterInput,
} from "../validators/auth.js";
import type { RequestFn, TokenStore } from "./http.js";

/**
 * The Bearer surface: tokens travel in the body and the caller stores them. That is what a
 * mobile app needs — it has no cookie jar — and it is the default here.
 *
 * Pass a `TokenStore` and every call that produces a new pair writes it before returning, so a
 * screen never has to remember to do it. Without one the methods behave as they always did and
 * you keep the tokens yourself.
 */
export function createAuthService(request: RequestFn, tokens?: TokenStore) {
    async function start(path: string, input: LoginInput | RegisterInput) {
        const session = await request<LoginResponse>(path, {
            method: "POST",
            body: JSON.stringify(input),
        });
        await tokens?.write({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
        });
        return session;
    }

    /** The stored token, or the one passed in — one of the two has to be there. */
    async function refreshTokenOf(explicit?: string): Promise<string | undefined> {
        return explicit ?? (await tokens?.read())?.refreshToken;
    }

    return {
        register: (input: RegisterInput) => start("/api/v1/auth/register", input),
        login: (input: LoginInput) => start("/api/v1/auth/login", input),

        /**
         * Rotates the pair: the old refresh token is burned server-side on success. You rarely
         * call this yourself with a store — the client rotates on its own after a 401.
         */
        refresh: async (refreshToken?: string): Promise<AuthTokens | null> => {
            const token = await refreshTokenOf(refreshToken);
            if (!token) return null;
            const pair = await request<AuthTokens>("/api/v1/auth/refresh", {
                method: "POST",
                body: JSON.stringify({ refreshToken: token }),
            });
            await tokens?.write(pair);
            return pair;
        },

        /** Revokes the whole token family — every device of this session is signed out. */
        logout: async (refreshToken?: string): Promise<void> => {
            const token = await refreshTokenOf(refreshToken);
            try {
                if (token) {
                    await request<void>("/api/v1/auth/logout", {
                        method: "POST",
                        body: JSON.stringify({ refreshToken: token }),
                    });
                }
            } finally {
                // A failed request must never leave the user looking signed in. The row on the
                // server expires on its own if the call did not land.
                await tokens?.write(null);
            }
        },

        me: () => request<{ user: AuthUser }>("/api/v1/auth/me"),

        /**
         * Changing the password signs out every OTHER device and returns a fresh pair for this
         * one, which is stored here. A name-only update returns `tokens: null`.
         */
        updateProfile: async (input: ProfileUpdateInput): Promise<ProfileUpdateResponse> => {
            const result = await request<ProfileUpdateResponse>("/api/v1/auth/me", {
                method: "PATCH",
                body: JSON.stringify(input),
            });
            if (result.tokens) await tokens?.write(result.tokens);
            return result;
        },
    };
}

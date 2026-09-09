import type { AuthTokens } from "../validators/auth.js";

/**
 * Where the app keeps the pair. The Bearer surface hands the tokens to the CLIENT, so
 * somebody has to store them: the refresh token belongs in the Keychain / Keystore on a
 * device (expo-secure-store, react-native-keychain) and the access token may live in memory.
 * Both sync and async implementations work.
 */
export interface TokenStore {
    read: () => AuthTokens | null | Promise<AuthTokens | null>;
    write: (tokens: AuthTokens | null) => void | Promise<void>;
}

export interface ApiClientOptions {
    baseUrl: string;
    /**
     * Give the client a store and it handles the session on its own: the access token goes out
     * on every call, a 401 rotates the pair once (single-flight) and the new pair is written
     * back. Without it the client is a plain fetch wrapper and rotation is your problem.
     */
    tokens?: TokenStore;
    /** Simpler alternative to `tokens` when something else already owns the session. */
    getAccessToken?: () => string | null | undefined;
    /**
     * Called once when a request comes back 401 and the rotation also fails — the family is
     * gone and the stored pair has been cleared. Wire it to your "back to the sign-in screen"
     * logic.
     */
    onSessionExpired?: () => void;
}

export class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(status: number, body: unknown) {
        super(`api_error_${status}`);
        this.status = status;
        this.body = body;
    }
}

/** A request function bound to a baseUrl + token source — this is what services receive. */
export type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Rotating IS the refresh, and a failed login must not set one off. */
const NO_RETRY_PATHS = [
    "/api/v1/auth/refresh",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/logout",
];

export function createRequest(options: ApiClientOptions): RequestFn {
    // Single-flight: a screen that fires five requests at once must not fire five rotations.
    // The first 401 starts one and the other four await the same promise.
    let refreshing: Promise<boolean> | null = null;

    async function send(path: string, init: RequestInit): Promise<Response> {
        const headers = new Headers(init.headers);
        // Never set Content-Type for FormData — the browser has to add the multipart
        // boundary itself, and a fixed value makes the body unparseable.
        if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
        const token = (await options.tokens?.read())?.accessToken ?? options.getAccessToken?.();
        if (token) headers.set("Authorization", `Bearer ${token}`);

        return fetch(`${options.baseUrl}${path}`, { ...init, headers });
    }

    async function rotate(): Promise<boolean> {
        const stored = await options.tokens!.read();
        if (!stored) return false;

        let res: Response;
        try {
            res = await fetch(`${options.baseUrl}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: stored.refreshToken }),
            });
        } catch {
            // A dead network is not a dead session — a phone goes through tunnels. Keep the
            // pair and let the next attempt try again.
            return false;
        }

        // The server rejected the token itself: the family is revoked or expired and no retry
        // will ever fix it, so stop sending a pair that cannot work.
        if (!res.ok) {
            await options.tokens!.write(null);
            return false;
        }

        const pair = (await res.json().catch(() => undefined)) as AuthTokens | undefined;
        if (!pair?.accessToken) return false;
        await options.tokens!.write(pair);
        return true;
    }

    async function refresh(): Promise<boolean> {
        refreshing ??= rotate().finally(() => {
            refreshing = null;
        });
        return refreshing;
    }

    return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        let res = await send(path, init);

        // An expired access token is routine, not a failure: rotate once and replay. Retrying
        // more than once would turn a revoked family into an infinite loop.
        if (res.status === 401 && options.tokens && !NO_RETRY_PATHS.includes(path)) {
            if (await refresh()) res = await send(path, init);
            else options.onSessionExpired?.();
        }

        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new ApiError(res.status, body);
        return body as T;
    };
}

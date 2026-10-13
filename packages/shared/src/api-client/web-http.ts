import { ApiError, type RequestFn } from "./http.js";

export interface WebApiClientOptions {
    /** Prefix in front of every path. Empty when the frontend is proxied onto the same origin. */
    baseUrl: string;
    /**
     * Called once when a request comes back 401 and the automatic refresh also fails — i.e. the
     * session is really over. Wire it to your "redirect to /login" logic.
     */
    onSessionExpired?: () => void;
    /**
     * Fetch implementation, the global one by default. On the server pass the framework's own —
     * SvelteKit's `event.fetch` forwards the visitor's cookies and resolves relative paths.
     */
    fetch?: typeof fetch;
    /**
     * Headers sent with every request, under the per-request ones. For server rendering where
     * no browser attaches the cookies, e.g. `{ cookie }` read in a Next Server Component.
     */
    headers?: HeadersInit;
    /**
     * Rotate the session on a 401 and replay (default true). Turn it OFF on the server: the new
     * cookies of a server-side rotation never reach the browser, which then sends the burnt
     * refresh token, trips reuse detection and loses the whole session family.
     */
    autoRefresh?: boolean;
}

export const WEB_AUTH_PATH = "/api/v1/auth/web";

/** Endpoints that must never trigger the automatic refresh: refreshing them IS the refresh. */
const NO_RETRY_PATHS = [
    `${WEB_AUTH_PATH}/refresh`,
    `${WEB_AUTH_PATH}/login`,
    `${WEB_AUTH_PATH}/register`,
    `${WEB_AUTH_PATH}/logout`,
];

/**
 * The Bearer requester's twin for a browser. There is no token to carry here: the session is
 * two httpOnly cookies the browser attaches by itself, so the client only has to say
 * `credentials: "include"` and rotate when a call comes back 401.
 */
export function createWebRequest(options: WebApiClientOptions): RequestFn {
    // A page that fires five requests at once must not fire five refreshes.
    let refreshing: Promise<boolean> | null = null;

    async function send(path: string, init: RequestInit): Promise<Response> {
        const headers = new Headers(options.headers);
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        // Never set Content-Type for FormData — the browser has to add the multipart
        // boundary itself, and a fixed value makes the body unparseable.
        if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
        // The whole scheme is httpOnly cookies; without this they are simply not sent.
        const doFetch = options.fetch ?? fetch;
        return doFetch(`${options.baseUrl}${path}`, { ...init, headers, credentials: "include" });
    }

    async function refresh(): Promise<boolean> {
        refreshing ??= send(`${WEB_AUTH_PATH}/refresh`, { method: "POST" })
            .then((res) => res.ok)
            .catch(() => false)
            .finally(() => {
                refreshing = null;
            });
        return refreshing;
    }

    return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        let res = await send(path, init);

        // An expired access cookie is routine, not a failure: rotate once and replay. Retrying
        // more than once would turn a revoked family into an infinite loop.
        if (res.status === 401 && options.autoRefresh !== false && !NO_RETRY_PATHS.includes(path)) {
            if (await refresh()) res = await send(path, init);
            else options.onSessionExpired?.();
        }

        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new ApiError(res.status, body);
        return body as T;
    };
}

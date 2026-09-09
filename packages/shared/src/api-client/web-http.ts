import { ApiError, type RequestFn } from "./http.js";

export interface WebApiClientOptions {
    /** Prefix in front of every path. Empty when the frontend is proxied onto the same origin. */
    baseUrl: string;
    /**
     * Called once when a request comes back 401 and the automatic refresh also fails — i.e. the
     * session is really over. Wire it to your "redirect to /login" logic.
     */
    onSessionExpired?: () => void;
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
        const headers = new Headers(init.headers);
        // Never set Content-Type for FormData — the browser has to add the multipart
        // boundary itself, and a fixed value makes the body unparseable.
        if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
        // The whole scheme is httpOnly cookies; without this they are simply not sent.
        return fetch(`${options.baseUrl}${path}`, { ...init, headers, credentials: "include" });
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
        if (res.status === 401 && !NO_RETRY_PATHS.includes(path)) {
            if (await refresh()) res = await send(path, init);
            else options.onSessionExpired?.();
        }

        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new ApiError(res.status, body);
        return body as T;
    };
}

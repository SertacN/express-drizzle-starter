export interface ApiClientOptions {
    baseUrl: string;
    getAccessToken?: () => string | null | undefined;
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

export function createRequest(options: ApiClientOptions): RequestFn {
    return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const headers = new Headers(init.headers);
        // Never set Content-Type for FormData — the browser has to add the multipart
        // boundary itself, and a fixed value makes the body unparseable.
        if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
        const token = options.getAccessToken?.();
        if (token) headers.set("Authorization", `Bearer ${token}`);

        const res = await fetch(`${options.baseUrl}${path}`, { ...init, headers });
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new ApiError(res.status, body);
        return body as T;
    };
}

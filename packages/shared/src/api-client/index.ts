import { createAuthService } from "./auth.service.js";
import { createExampleService } from "./example.service.js";
import { type ApiClientOptions, createRequest } from "./http.js";
import { createUploadsService } from "./uploads.service.js";
import { createWebAuthService } from "./web-auth.service.js";
import { createWebRequest, type WebApiClientOptions } from "./web-http.js";

export { ApiError, type ApiClientOptions, type RequestFn, type TokenStore } from "./http.js";
export { WEB_AUTH_PATH, type WebApiClientOptions } from "./web-http.js";

/**
 * Bundles every service into one client. `request` (baseUrl + token) is built once and
 * injected into each service — adding a resource is a new `*.service.ts` plus one line here.
 *
 * This is the Bearer client, which is what the API serves by default and what a mobile app
 * needs. Give it a `tokens` store and it keeps the session for you: rotation on 401, the new
 * pair written back, `onSessionExpired` when the family is finally gone.
 *
 * Usage in an app:
 *   const api = createApiClient({
 *     baseUrl: "https://api.example.com",
 *     tokens: { read: readFromSecureStore, write: writeToSecureStore },
 *     onSessionExpired: () => navigation.reset({ routes: [{ name: "SignIn" }] }),
 *   });
 *   const { items } = await api.examples.list({ page: 1 });
 */
export function createApiClient(options: ApiClientOptions) {
    const request = createRequest(options);

    return {
        auth: createAuthService(request, options.tokens),
        examples: createExampleService(request),
        uploads: createUploadsService(request),
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The same client for a browser, against `/api/v1/auth/web/*`: the session is two httpOnly
 * cookies instead of a stored pair, so there is nothing to keep and nothing an XSS bug can
 * read. Only `auth` differs — every other service is the exact same code, because a resource
 * service never knew how the session travelled.
 *
 * Usage in a frontend:
 *   const api = createWebApiClient({ baseUrl: "", onSessionExpired: () => navigate("/login") });
 *   await api.auth.login({ email, password }); // cookies are set by the server
 */
export function createWebApiClient(options: WebApiClientOptions) {
    const request = createWebRequest(options);

    return {
        auth: createWebAuthService(request),
        examples: createExampleService(request),
        uploads: createUploadsService(request),
    };
}

export type WebApiClient = ReturnType<typeof createWebApiClient>;

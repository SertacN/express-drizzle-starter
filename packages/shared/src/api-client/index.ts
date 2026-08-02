import { createAuthService } from "./auth.service.js";
import { createExampleService } from "./example.service.js";
import { type ApiClientOptions, createRequest } from "./http.js";
import { createUploadsService } from "./uploads.service.js";

export { ApiError, type ApiClientOptions, type RequestFn } from "./http.js";

/**
 * Bundles every service into one client. `request` (baseUrl + token) is built once and
 * injected into each service — adding a resource is a new `*.service.ts` plus one line here.
 *
 * Usage in a frontend:
 *   const api = createApiClient({ baseUrl: "", getAccessToken: () => session.accessToken });
 *   const { items } = await api.examples.list({ page: 1 });
 */
export function createApiClient(options: ApiClientOptions) {
    const request = createRequest(options);

    return {
        auth: createAuthService(request),
        examples: createExampleService(request),
        uploads: createUploadsService(request),
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;

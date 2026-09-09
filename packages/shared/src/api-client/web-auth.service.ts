import type {
    AuthUser,
    LoginInput,
    ProfileUpdateInput,
    RegisterInput,
    WebSessionResponse,
} from "../validators/auth.js";
import type { RequestFn } from "./http.js";
import { WEB_AUTH_PATH } from "./web-http.js";

/**
 * The cookie half of the auth surface. Nothing returns a token here — there is nothing for the
 * caller to store, and no `TokenStore` to hand in. `logout` needs no argument either: the
 * server reads the refresh cookie and clears both.
 *
 * `GET /auth/me` is NOT duplicated on the web surface — it issues no tokens, and `requireAuth`
 * accepts the access cookie on the shared endpoint.
 */
export function createWebAuthService(request: RequestFn) {
    return {
        register: (input: RegisterInput) =>
            request<WebSessionResponse>(`${WEB_AUTH_PATH}/register`, {
                method: "POST",
                body: JSON.stringify(input),
            }),
        login: (input: LoginInput) =>
            request<WebSessionResponse>(`${WEB_AUTH_PATH}/login`, {
                method: "POST",
                body: JSON.stringify(input),
            }),
        /**
         * Rotates the cookie pair; the old refresh token is burned server-side on success.
         * You rarely call this yourself — the client refreshes on its own after a 401.
         */
        refresh: () => request<WebSessionResponse>(`${WEB_AUTH_PATH}/refresh`, { method: "POST" }),
        /** Revokes the whole token family and clears both cookies. */
        logout: () => request<void>(`${WEB_AUTH_PATH}/logout`, { method: "POST" }),
        me: () => request<{ user: AuthUser }>("/api/v1/auth/me"),
        /**
         * Changing the password signs out every OTHER device; this tab gets a fresh cookie
         * pair back, so nothing else has to be done here.
         */
        updateProfile: (input: ProfileUpdateInput) =>
            request<WebSessionResponse>(`${WEB_AUTH_PATH}/me`, {
                method: "PATCH",
                body: JSON.stringify(input),
            }),
    };
}

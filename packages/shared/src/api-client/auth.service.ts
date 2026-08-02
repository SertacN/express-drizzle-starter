import type {
    AuthTokens,
    AuthUser,
    LoginInput,
    LoginResponse,
    ProfileUpdateInput,
    ProfileUpdateResponse,
    RegisterInput,
} from "../validators/auth.js";
import type { RequestFn } from "./http.js";

export function createAuthService(request: RequestFn) {
    return {
        register: (input: RegisterInput) =>
            request<LoginResponse>("/api/v1/auth/register", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        login: (input: LoginInput) =>
            request<LoginResponse>("/api/v1/auth/login", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        /** Rotates the pair: the old refresh token is burned server-side on success. */
        refresh: (refreshToken: string) =>
            request<AuthTokens>("/api/v1/auth/refresh", {
                method: "POST",
                body: JSON.stringify({ refreshToken }),
            }),
        /** Revokes the whole token family — every device of this session is signed out. */
        logout: (refreshToken: string) =>
            request<void>("/api/v1/auth/logout", {
                method: "POST",
                body: JSON.stringify({ refreshToken }),
            }),
        me: () => request<{ user: AuthUser }>("/api/v1/auth/me"),
        /** If the password changed, store the returned tokens — the old ones are dead. */
        updateProfile: (input: ProfileUpdateInput) =>
            request<ProfileUpdateResponse>("/api/v1/auth/me", {
                method: "PATCH",
                body: JSON.stringify(input),
            }),
    };
}

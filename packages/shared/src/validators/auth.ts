import { z } from "zod";

// Contract shared by the API (zod parse in controllers) and every frontend (form validation).
// Change it here and both ends move together — that is the whole point of this package.

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const password = z.string().min(8).max(200);

export const registerSchema = z.object({
    email: z.email().max(255),
    password,
    name: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({
    email: z.email().max(255),
    password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
    refreshToken: z.string().min(1),
});

export const profileUpdateSchema = z
    .object({
        name: z.string().trim().min(2).max(120).optional(),
        currentPassword: z.string().min(1).max(200).optional(),
        newPassword: password.optional(),
    })
    // Changing a password requires proving you know the old one; the API enforces this too.
    .refine((v) => !v.newPassword || !!v.currentPassword, {
        message: "current_password_required",
        path: ["currentPassword"],
    });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
}

export interface LoginResponse extends AuthTokens {
    user: AuthUser;
}

export interface ProfileUpdateResponse {
    user: AuthUser;
    /** Only set when the password changed: the caller's old tokens were just revoked. */
    tokens: AuthTokens | null;
}

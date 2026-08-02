/**
 * The module's public API. Other modules import from HERE — never from `auth.service.js`
 * directly. Keeping the surface in one file is what makes a module replaceable.
 */
export { authRouter } from "./auth.routes.js";
export { getProfile } from "./auth.service.js";

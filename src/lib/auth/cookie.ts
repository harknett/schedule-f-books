/**
 * The session cookie name, isolated from the session module.
 *
 * Middleware runs on the Edge runtime and cannot pull in the SQLite layer, so
 * it imports the name from here rather than from session.ts.
 */
export const SESSION_COOKIE = "sfb_session";

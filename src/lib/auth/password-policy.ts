/**
 * Password rules shared by the browser and the server.
 *
 * Deliberately free of any Node imports so a client component can show the
 * requirement and check it as the user types. Hashing and verification live in
 * password.ts, which is server-only - importing that from a client component
 * pulls node:crypto into the browser bundle, where it is empty.
 *
 * Client-side checks are for fast feedback; the server calls validatePassword
 * again before storing anything.
 */

export const MIN_PASSWORD_LENGTH = 10;

const MAX_PASSWORD_LENGTH = 1024;

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password is too long.");
  }
}

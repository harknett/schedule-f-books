import "server-only";

import { headers } from "next/headers";

import { getStore } from "@/lib/db";

/**
 * Slowing down whoever is guessing.
 *
 * An unthrottled sign-in form is fine on a laptop and indefensible on a
 * hostname, and "it is only on the LAN" is a description of today's network
 * rather than a property of the code. Two different attacks need two limits:
 *
 *   - **One address, many guesses.** Held by the per-address limit.
 *   - **Many addresses, one account.** A botnet spreads guesses so thinly that
 *     no single address trips anything. Held by the per-account limit, which
 *     counts failures against an email from anywhere.
 *
 * The per-account limit can be used to lock a known user out on purpose, so it
 * is deliberately looser and its window shorter: annoying the account holder
 * is only an acceptable price for a real defence when the annoyance expires
 * quickly.
 */

const WINDOW_MINUTES = 15;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 20;

/**
 * The caller's address.
 *
 * Behind a reverse proxy the socket address is the proxy, so a forwarded
 * header is used when present. That header is client-supplied and trivially
 * spoofed if the app is ever exposed directly — which is why the deployment
 * guide insists on binding loopback with a proxy in front that *sets* rather
 * than appends it. A spoofable key makes throttling weaker, not useless: it
 * still costs an attacker something, and the per-account limit does not depend
 * on the address at all.
 */
export async function callerAddress(): Promise<string> {
  const head = await headers();
  const forwarded = head.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return head.get("x-real-ip")?.trim() || "unknown";
}

export interface ThrottleVerdict {
  blocked: boolean;
  message?: string;
}

/**
 * Whether this sign-in attempt should even be tried.
 *
 * The message deliberately does not say which limit was hit: "too many
 * attempts against this account" would confirm the account exists.
 */
export async function checkLoginThrottle(email: string): Promise<ThrottleVerdict> {
  const store = getStore();
  store.pruneLoginAttempts();

  const ip = await callerAddress();
  const byIp = store.loginFailuresByIp(ip, WINDOW_MINUTES);
  const byEmail = store.loginFailuresByEmail(email, WINDOW_MINUTES);

  if (byIp >= MAX_PER_IP || byEmail >= MAX_PER_EMAIL) {
    return {
      blocked: true,
      message: `Too many sign-in attempts. Try again in ${WINDOW_MINUTES} minutes.`,
    };
  }
  return { blocked: false };
}

export async function recordLoginFailure(email: string): Promise<void> {
  getStore().recordLoginFailure(await callerAddress(), email);
}

export async function clearLoginFailures(email: string): Promise<void> {
  getStore().clearLoginFailures(await callerAddress(), email);
}

export const THROTTLE_LIMITS = {
  windowMinutes: WINDOW_MINUTES,
  maxPerIp: MAX_PER_IP,
  maxPerEmail: MAX_PER_EMAIL,
} as const;

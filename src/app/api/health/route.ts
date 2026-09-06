import { getStore } from "@/lib/db";

/**
 * Whether the service is actually able to serve.
 *
 * For `systemctl`, a reverse proxy, or a monitor to probe. It touches the
 * database rather than just returning 200, because the failure worth catching
 * is the one where Node is happily listening but the data directory is not
 * writable or not mounted - which looks perfectly healthy from the outside.
 *
 * Unauthenticated by design, so it says nothing a stranger should not hear:
 * no versions, no paths, no counts.
 */
export async function GET() {
  try {
    getStore().countUsers();
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  return Response.json(
    { status: "ok" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

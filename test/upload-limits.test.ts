import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import {
  MAX_RECEIPT_BYTES,
  MAX_UPLOAD_TOTAL_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  SERVER_ACTION_BODY_LIMIT_BYTES,
} from "@/lib/receipt-limits";

/**
 * Guards the limit that actually decides whether a receipt uploads.
 *
 * Receipts travel inside a Server Action, so Next's `bodySizeLimit` caps them
 * regardless of what the app believes. It defaults to 1 MB. This project
 * shipped for weeks advertising 15 MB receipts and validating against that in
 * the picker, while every phone photo was rejected by the framework before any
 * application code ran - and the failure surfaced as "a server error occurred"
 * with the half-filled form discarded, so it never looked like a size problem.
 *
 * The fix is that next.config.ts derives the limit from these constants rather
 * than repeating the number. These tests fail if that wiring is ever undone.
 */
describe("Server Action body limit", () => {
  it("is configured, not left at Next's 1 MB default", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit, "next.config.ts must set serverActions.bodySizeLimit").toBeDefined();
  });

  it("is the one derived from the receipt limits", () => {
    // Not "some number big enough": the same value, so the two cannot drift.
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(
      SERVER_ACTION_BODY_LIMIT_BYTES,
    );
  });

  it("leaves room for a full submission plus multipart overhead", () => {
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBe(
      MAX_UPLOAD_TOTAL_BYTES + MULTIPART_OVERHEAD_BYTES,
    );
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeGreaterThan(MAX_UPLOAD_TOTAL_BYTES);
  });

  it("can carry at least one receipt of the size the app advertises", () => {
    // The bug in one line: the per-file limit the picker shows the user has to
    // fit inside the request the framework will accept.
    expect(MAX_UPLOAD_TOTAL_BYTES).toBeGreaterThanOrEqual(MAX_RECEIPT_BYTES);
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeGreaterThan(MAX_RECEIPT_BYTES);
  });

  it("comfortably exceeds a typical phone photo", () => {
    // The case that was actually failing: an ordinary 4 MB camera JPEG.
    const typicalPhonePhoto = 4 * 1024 * 1024;
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeGreaterThan(typicalPhonePhoto);
  });
});

describe("standalone output", () => {
  it("is enabled, since the systemd unit runs .next/standalone/server.js", () => {
    expect(nextConfig.output).toBe("standalone");
  });
});

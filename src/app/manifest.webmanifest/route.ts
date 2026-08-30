import { NextResponse } from "next/server";

/**
 * Lets the app be added to a phone's home screen, so receipt capture is one tap
 * from the field rather than a browser bookmark.
 */
export function GET() {
  return NextResponse.json({
    name: "Schedule F Books",
    short_name: "Farm Books",
    description: "Farm income, expenses, receipts, and hours - organised for Schedule F.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f3",
    theme_color: "#3f6212",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  });
}

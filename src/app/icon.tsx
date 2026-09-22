import { ImageResponse } from "next/og";

// Next.js renders this at build time and auto-injects <link rel="icon">
// into <head>.
//
// The mark is rendered as SVG so it stays sharp at favicon size.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ec008c",
          borderRadius: "50%",
        }}
      >
        <svg
          width="25"
          height="25"
          viewBox="0 0 32 32"
          fill="none"
        >
          <circle cx="16" cy="16" r="13" fill="#ffffff" />
          <path
            d="M8 22V10h3.2l4.8 6.2 4.8-6.2H24v12h-3.1v-7.1L16 21l-4.9-6.1V22H8Z"
            fill="#ec008c"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}

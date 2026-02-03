import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0a, #1a1a2e)",
          color: "#ffffff",
          padding: "72px",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Kyokon
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#a1a1aa",
            marginTop: 12,
          }}
        >
          Nutrition data that doesn’t hallucinate.
        </div>
        <div
          style={{
            fontSize: 22,
            color: "#71717a",
            marginTop: 16,
            maxWidth: 900,
          }}
        >
          231K recipes taught us what “ground beef” means — no embeddings, no vibes.
        </div>
        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 44,
            padding: "16px 24px",
            borderRadius: 12,
            backgroundColor: "rgba(24, 24, 27, 0.9)",
            fontSize: 20,
            fontWeight: 600,
            color: "#6366f1",
          }}
        >
          <span>8,158 Foods</span>
          <span>228 Nutrients</span>
          <span>7,291 Cookable Ingredients</span>
          <span>REST API</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
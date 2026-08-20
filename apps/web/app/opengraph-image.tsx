import { ImageResponse } from "next/og";

export const alt =
  "AIVaultsAI — Websites, AI-assistenten en leadautomatisering voor bedrijven.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08090b",
          color: "#f2efe8",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: "1px solid #d4af77",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 28, letterSpacing: "-0.03em" }}>AIVaultsAI</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, lineHeight: 1.05, letterSpacing: "-0.04em", maxWidth: 900 }}>
            Websites, AI-assistenten en leadautomatisering voor bedrijven.
          </div>
          <div style={{ fontSize: 24, color: "#9b968c", maxWidth: 780 }}>
            AIVaultsAI bouwt websites, AI-assistenten en automatiseringen die bedrijven
            helpen bezoekers op te vangen, leads te kwalificeren en werk slimmer te organiseren.
          </div>
        </div>
        <div style={{ display: "flex", color: "#d4af77", fontSize: 18, letterSpacing: "0.16em" }}>
          aivaultsai.one
        </div>
      </div>
    ),
    size,
  );
}

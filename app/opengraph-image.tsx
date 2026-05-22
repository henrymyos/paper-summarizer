import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Paper Summarizer — RAG Q&A over PDFs with cited answers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0b",
          backgroundImage:
            "radial-gradient(900px 600px at 10% -10%, rgba(96,165,250,0.28), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(59,130,246,0.18), transparent 55%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(96,165,250,0.18)",
              border: "1px solid rgba(96,165,250,0.45)",
              boxShadow: "0 0 32px rgba(96,165,250,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#60a5fa",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            ✦
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
            Paper Summarizer
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            Ask your PDFs.
            <br />
            <span style={{ color: "#60a5fa" }}>Get cited answers.</span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            Retrieval-augmented Q&A over uploaded papers, powered by Voyage
            embeddings, pgvector, and Claude.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 18,
            color: "#a1a1aa",
          }}
        >
          {[
            "Next.js",
            "TypeScript",
            "Supabase + pgvector",
            "Voyage AI",
            "Claude",
          ].map((t) => (
            <div
              key={t}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

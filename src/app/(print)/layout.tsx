export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#111",
        minHeight: "100vh",
        padding: "24px",
        // The client's own documents are set in Verdana (their .docx body font),
        // not a serif. DejaVu Sans is the fallback for the Linux container, where
        // Verdana isn't licensable — it is the closest free humanist sans, and the
        // Dockerfile installs it so headless Chromium doesn't drop to a default with
        // different metrics. On any machine that has Verdana (Word, macOS, Windows)
        // the first entry wins and the match is exact.
        fontFamily: "Verdana, 'DejaVu Sans', Geneva, Tahoma, sans-serif",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

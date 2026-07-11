export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#111",
        minHeight: "100vh",
        padding: "24px",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

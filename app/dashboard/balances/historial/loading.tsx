export default function HistorialLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="h-skeleton" style={{ width: 200, height: 24, borderRadius: 6, marginBottom: 8 }} />
        <div className="h-skeleton" style={{ width: 220, height: 14, borderRadius: 4 }} />
      </div>

      {/* Filters card */}
      <div className="h-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div className="h-skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
          <div className="h-skeleton" style={{ width: 50, height: 14, borderRadius: 4 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <div className="h-skeleton" style={{ width: 50, height: 12, borderRadius: 4, marginBottom: 6 }} />
            <div className="h-skeleton" style={{ width: "100%", height: 36, borderRadius: 8 }} />
          </div>
          <div>
            <div className="h-skeleton" style={{ width: 40, height: 12, borderRadius: 4, marginBottom: 6 }} />
            <div className="h-skeleton" style={{ width: "100%", height: 36, borderRadius: 8 }} />
          </div>
          <div>
            <div className="h-skeleton" style={{ width: 60, height: 12, borderRadius: 4, marginBottom: 6 }} />
            <div className="h-skeleton" style={{ width: "100%", height: 36, borderRadius: 8 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div className="h-skeleton" style={{ width: 110, height: 36, borderRadius: 8 }} />
          <div className="h-skeleton" style={{ width: 80, height: 36, borderRadius: 8 }} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 100, height: 28, borderRadius: 6, marginBottom: 6 }} />
          <div className="h-skeleton" style={{ width: 70, height: 14, borderRadius: 4 }} />
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 80, height: 28, borderRadius: 6, marginBottom: 6 }} />
          <div className="h-skeleton" style={{ width: 70, height: 14, borderRadius: 4 }} />
        </div>
      </div>

      {/* Payment list */}
      <div className="h-card" style={{ overflow: "hidden" }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(100px, 140px) minmax(80px, 100px) minmax(70px, 90px) minmax(60px, 100px) 1fr",
              gap: 16,
              alignItems: "center",
              padding: "16px 20px",
              borderBottom: i < 4 ? "1px solid var(--hborder)" : "none",
            }}
          >
            <div>
              <div className="h-skeleton" style={{ width: 100, height: 14, borderRadius: 4, marginBottom: 4 }} />
              <div className="h-skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
            </div>
            <div className="h-skeleton" style={{ width: 80, height: 16, borderRadius: 4 }} />
            <div className="h-skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
            <div className="h-skeleton" style={{ width: 50, height: 14, borderRadius: 4 }} />
            <div className="h-skeleton" style={{ width: 120, height: 14, borderRadius: 4 }} />
          </div>
        ))}
        
        {/* Pagination skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--hborder)" }}>
          <div className="h-skeleton" style={{ width: 100, height: 14, borderRadius: 4 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="h-skeleton" style={{ width: 80, height: 32, borderRadius: 6 }} />
            <div className="h-skeleton" style={{ width: 80, height: 32, borderRadius: 6 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

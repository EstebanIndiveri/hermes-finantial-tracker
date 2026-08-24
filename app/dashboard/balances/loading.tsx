export default function BalancesLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div className="h-skeleton" style={{ width: 200, height: 24, borderRadius: 6, marginBottom: 8 }} />
          <div className="h-skeleton" style={{ width: 320, height: 16, borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="h-skeleton" style={{ width: 100, height: 36, borderRadius: 8 }} />
          <div className="h-skeleton" style={{ width: 110, height: 36, borderRadius: 8 }} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 140, height: 32, borderRadius: 6, marginBottom: 8 }} />
          <div className="h-skeleton" style={{ width: 100, height: 14, borderRadius: 4 }} />
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 80, height: 32, borderRadius: 6, marginBottom: 8 }} />
          <div className="h-skeleton" style={{ width: 100, height: 14, borderRadius: 4 }} />
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* Te deben column */}
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 100, height: 20, borderRadius: 4, marginBottom: 16 }} />
          
          {/* Partner card skeleton */}
          <div style={{ padding: 16, background: "var(--hbg)", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="h-skeleton" style={{ width: 120, height: 18, borderRadius: 4 }} />
              <div className="h-skeleton" style={{ width: 80, height: 18, borderRadius: 4 }} />
            </div>
            <div className="h-skeleton" style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 12 }} />
            <div className="h-skeleton" style={{ width: 90, height: 14, borderRadius: 4 }} />
          </div>
          
          {/* Second partner skeleton */}
          <div style={{ padding: 16, background: "var(--hbg)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="h-skeleton" style={{ width: 100, height: 18, borderRadius: 4 }} />
              <div className="h-skeleton" style={{ width: 70, height: 18, borderRadius: 4 }} />
            </div>
            <div className="h-skeleton" style={{ width: 120, height: 14, borderRadius: 4, marginBottom: 12 }} />
            <div className="h-skeleton" style={{ width: 90, height: 14, borderRadius: 4 }} />
          </div>
        </div>

        {/* Debés column */}
        <div className="h-card" style={{ padding: 20 }}>
          <div className="h-skeleton" style={{ width: 80, height: 20, borderRadius: 4, marginBottom: 16 }} />
          
          {/* Empty state skeleton */}
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div className="h-skeleton" style={{ width: 140, height: 18, borderRadius: 4, margin: "0 auto 8px" }} />
            <div className="h-skeleton" style={{ width: 200, height: 14, borderRadius: 4, margin: "0 auto" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

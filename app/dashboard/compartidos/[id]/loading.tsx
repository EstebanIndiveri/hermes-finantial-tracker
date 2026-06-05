import { Skel } from "@/components/ui/Skeleton";

export default function SessionDetailLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Back + header */}
      <Skel w={140} h={13} mb={12} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div><Skel w={200} h={24} mb={8} /><Skel w={280} h={13} /></div>
        <Skel w={140} h={38} r={8} />
      </div>

      <div className="h-splits-detail-layout">
        {/* Left: expense list */}
        <div className="h-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
            <Skel w={160} h={16} />
          </div>
          <div style={{ padding: "0 18px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--hborder)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Skel w={36} h={36} r={8} />
                  <div><Skel w={140} h={14} mb={6} /><Skel w={200} h={11} /></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Skel w={70} h={16} mb={6} />
                  <Skel w={90} h={11} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: balances + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="h-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hborder)" }}>
              <Skel w={80} h={16} />
            </div>
            <div style={{ padding: "0 18px" }}>
              {[0, 1].map(i => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--hborder)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Skel w={28} h={28} r={14} />
                    <div><Skel w={80} h={14} mb={4} /><Skel w={60} h={11} /></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Skel w={80} h={18} mb={6} />
                    <Skel w={90} h={26} r={6} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-card" style={{ padding: 16 }}>
            <Skel w={100} h={14} mb={12} />
            <Skel w="100%" h={38} r={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

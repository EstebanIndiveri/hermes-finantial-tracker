import { Skel } from "@/components/ui/Skeleton";

export default function CompartidosLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Skel w={180} h={26} mb={8} />
          <Skel w={260} h={13} />
        </div>
        <Skel w={140} h={38} r={8} />
      </div>

      {/* Summary strip */}
      <div className="h-skel-session-strip">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-card" style={{ padding: 16 }}>
            <Skel w={80} h={11} mb={8} />
            <Skel w={100} h={26} mb={6} />
            <Skel w={130} h={11} />
          </div>
        ))}
      </div>

      {/* Session cards */}
      {[0, 1, 2].map(i => (
        <div key={i} className="h-skel-session-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <Skel w={160} h={18} />
            <Skel w={60} h={22} r={20} />
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <Skel w={80} h={12} />
            <Skel w={60} h={12} />
            <Skel w={100} h={12} />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Skel w={80} h={26} r={20} />
            <Skel w={70} h={26} r={20} />
            <Skel w={75} h={26} r={20} />
          </div>
          <div className="h-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
            <div><Skel w={100} h={12} mb={6} /><Skel w={200} h={11} /></div>
            <Skel w={70} h={22} />
          </div>
        </div>
      ))}
    </div>
  );
}

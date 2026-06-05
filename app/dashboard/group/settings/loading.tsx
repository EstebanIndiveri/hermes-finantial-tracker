import { Skel } from "@/components/ui/Skeleton";

export default function GroupSettingsLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <Skel w={200} h={26} mb={8} />
        <Skel w={180} h={13} />
      </div>

      {/* Group name card */}
      <div className="h-card" style={{ marginBottom: 20, padding: 20 }}>
        <Skel w={140} h={11} mb={12} />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Skel w="100%" h={42} r={8} />
          <div style={{ flexShrink: 0 }}><Skel w={90} h={42} r={8} /></div>
        </div>
      </div>

      {/* Members card */}
      <div className="h-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Skel w={120} h={14} />
          <Skel w={90} h={36} r={8} />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hborder)" }}>
            <div style={{ flexShrink: 0 }}><Skel w={34} h={34} r={17} /></div>
            <div style={{ flex: 1 }}>
              <Skel w={130} h={14} mb={6} />
              <Skel w={70} h={11} />
            </div>
            <Skel w={80} h={28} r={6} />
            <Skel w={28} h={28} r={6} />
          </div>
        ))}
      </div>
    </div>
  );
}

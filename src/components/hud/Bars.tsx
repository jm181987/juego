import { useGame } from "@/game/store";

export function StatBar({
  value, max, color, label, glow, w = 220,
}: { value: number; max: number; color: string; label: string; glow?: string; w?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: "#d0d0d0", marginBottom: 2, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
        {label} <span style={{ color: "#888" }}>{Math.ceil(value)}/{max}</span>
      </div>
      <div style={{
        width: w, height: 12, background: "#000c",
        border: "1px solid #ffffff22", borderRadius: 2,
        boxShadow: "inset 0 1px 3px #000a",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct * 100}%`, height: "100%",
          background: `linear-gradient(180deg, ${color}, ${color}88)`,
          boxShadow: glow ? `0 0 8px ${glow}` : undefined,
          transition: "width .18s ease-out",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #ffffff22, transparent 40%)",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

export function BatteryPill() {
  const battery = useGame((s) => s.battery);
  const max = useGame((s) => s.maxBattery);
  const on = useGame((s) => s.flashlightOn);
  const toggle = useGame((s) => s.toggleFlashlight);
  const pct = Math.max(0, Math.min(1, battery / max));
  const color = pct > 0.4 ? "#ffd07a" : pct > 0.15 ? "#ff9848" : "#ff4848";
  return (
    <button onClick={toggle} title="Encender/apagar linterna (F)" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 9px", background: "#0a0418dd",
      border: `1px solid ${on ? color + "88" : "#ffffff22"}`, borderRadius: 20,
      color: "#eee", fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
      cursor: "pointer",
      boxShadow: on ? `0 0 10px ${color}66` : "none",
    }}>
      <span style={{ fontSize: 14, opacity: on ? 1 : 0.4 }}>🔦</span>
      <div style={{
        width: 46, height: 8, background: "#000", border: "1px solid #333", borderRadius: 1,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: color }} />
      </div>
      <span style={{ color, minWidth: 24, textAlign: "right" }}>{Math.round(pct * 100)}%</span>
    </button>
  );
}

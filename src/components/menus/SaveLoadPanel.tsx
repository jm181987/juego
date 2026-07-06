import { Backdrop } from "./PauseMenu";
import { useGame, type SaveSlot } from "@/game/store";

export function SaveLoadPanel({
  onSave, onLoad,
}: {
  onSave: (slotId: number) => void;
  onLoad: (slot: SaveSlot) => void;
}) {
  const saves = useGame((s) => s.saves);
  const setMenu = useGame((s) => s.setMenu);
  const del = useGame((s) => s.deleteSlot);

  const slots = new Array(6).fill(null).map((_, i) => saves.find((s) => s.id === i) ?? null);

  return (
    <Backdrop>
      <div style={{
        width: 620, maxHeight: "88vh", overflow: "auto",
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000",
        color: "#fff", padding: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: "#a080ff", letterSpacing: 4, textTransform: "uppercase", fontSize: 20 }}>Guardar / Cargar</h2>
          <button onClick={() => setMenu("pause")} style={{ background: "transparent", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {slots.map((slot, i) => (
            <div key={i} style={{
              padding: 12, background: slot ? "#1a0838aa" : "#0a0418aa",
              border: `1px solid ${slot ? "#7ee6ff66" : "#333"}`, borderRadius: 6,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ fontSize: 11, color: "#7ee6ff", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
                Slot {i + 1}
              </div>
              {slot ? (
                <>
                  {slot.screenshot && (
                    <img src={slot.screenshot} alt="save" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 3, background: "#000" }} />
                  )}
                  <div style={{ fontSize: 12, color: "#ccc" }}>
                    <div><strong>{slot.world}</strong> · Nv.{slot.level}</div>
                    <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
                      {new Date(slot.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => onLoad(slot)} style={btnStyle("#7ee6ff")}>Cargar</button>
                    <button onClick={() => onSave(i)} style={btnStyle("#a080ff")}>Sobrescribir</button>
                    <button onClick={() => del(i)} style={{ ...btnStyle("#ff4050"), flex: 0.5 }}>×</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>Vacío</div>
                  <button onClick={() => onSave(i)} style={btnStyle("#7ee6ff")}>Guardar aquí</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Backdrop>
  );
}

const btnStyle = (color: string) => ({
  flex: 1, padding: "8px 6px", background: "transparent",
  border: `1px solid ${color}88`, color, cursor: "pointer",
  fontSize: 11, letterSpacing: 1, textTransform: "uppercase" as const, fontWeight: 600,
  borderRadius: 3,
});

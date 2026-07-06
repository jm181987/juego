import { useState } from "react";
import { Backdrop } from "./PauseMenu";
import { useGame, type InventoryItem } from "@/game/store";

const RARITY: Record<InventoryItem["rarity"], string> = {
  common: "#aaaaaa",
  rare: "#7ee6ff",
  epic: "#a080ff",
  legendary: "#ffb050",
};

export function Inventory() {
  const items = useGame((s) => s.inventory);
  const setMenu = useGame((s) => s.setMenu);
  const [drag, setDrag] = useState<string | null>(null);
  const [equipped, setEquipped] = useState<Record<string, InventoryItem | null>>({
    head: null, chest: null, hands: null, weapon: null, offhand: null,
  });

  const slots = ["head", "chest", "hands", "weapon", "offhand"] as const;
  const slotLabel: Record<(typeof slots)[number], string> = {
    head: "Cabeza", chest: "Torso", hands: "Manos", weapon: "Arma", offhand: "Mano izq.",
  };

  const gridSize = 24;
  const cells = new Array(gridSize).fill(null).map((_, i) => items[i] ?? null);

  const equip = (item: InventoryItem) => {
    if (!item.slot) return;
    setEquipped((e) => ({ ...e, [item.slot!]: item }));
  };

  return (
    <Backdrop>
      <div style={{
        width: 720, maxHeight: "88vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000, 0 0 40px #7ee6ff22",
        color: "#fff",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #7ee6ff22", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, color: "#a080ff", letterSpacing: 4, textTransform: "uppercase", fontSize: 20 }}>Inventario</h2>
          <button onClick={() => setMenu("pause")} style={{ background: "transparent", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, padding: 20, overflow: "auto" }}>
          {/* equipment slots */}
          <div>
            <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontFamily: "monospace" }}>Equipo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {slots.map((s) => {
                const it = equipped[s];
                return (
                  <div key={s}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const it2 = items.find((x) => x.id === drag);
                      if (it2 && it2.slot === s) equip(it2);
                      setDrag(null);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: 6,
                      background: it ? "#1a0838" : "#0a0418aa",
                      border: `1px solid ${it ? RARITY[it.rarity] : "#333"}`,
                      borderRadius: 4, minHeight: 40,
                    }}>
                    <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "#000", borderRadius: 3 }}>
                      {it?.icon ?? ""}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <div style={{ color: it ? RARITY[it.rarity] : "#666" }}>{slotLabel[s]}</div>
                      <div style={{ color: "#888", fontSize: 10 }}>{it?.name ?? "vacío"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* grid */}
          <div>
            <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, fontFamily: "monospace" }}>Bolsa · arrastra para equipar</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {cells.map((it, i) => (
                <div key={i}
                  draggable={!!it}
                  onDragStart={() => it && setDrag(it.id)}
                  onDragEnd={() => setDrag(null)}
                  title={it ? `${it.name}\n${it.desc}` : ""}
                  style={{
                    aspectRatio: "1", background: "#0a0418",
                    border: `1px solid ${it ? RARITY[it.rarity] + "aa" : "#222"}`,
                    borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, cursor: it ? "grab" : "default", position: "relative",
                    boxShadow: it ? `inset 0 0 12px ${RARITY[it.rarity]}22` : "none",
                    opacity: drag === it?.id ? 0.4 : 1,
                  }}>
                  {it?.icon}
                  {it && it.qty > 1 && (
                    <div style={{ position: "absolute", bottom: 2, right: 4, fontSize: 10, color: "#fff", fontFamily: "monospace", textShadow: "0 0 4px #000" }}>{it.qty}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
